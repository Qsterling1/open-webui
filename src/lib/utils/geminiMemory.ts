/**
 * Gemini Live Memory Manager
 *
 * Handles persistent memory for Gemini Live sessions:
 * - Automatic transcript saving
 * - Periodic summarization via local Ollama
 * - Context restoration on reconnection
 */

import {
	createGeminiSession,
	updateGeminiSession,
	addGeminiTranscript,
	getGeminiSessionContext,
	type GeminiSession,
	type GeminiTranscript,
	type GeminiSessionContext
} from '$lib/apis/gemini';

// Configuration for summarization
const SUMMARIZATION_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const SUMMARIZATION_MESSAGE_THRESHOLD = 10; // Every 10 messages
const TRANSCRIPT_CONTEXT_LIMIT = 50; // Last 50 messages for context

// Summarization prompt for Ollama
const SUMMARIZATION_PROMPT = `Create a detailed summary of this conversation that preserves:

1. PROBLEM: What is the user trying to accomplish?
2. FILES: Which files/code are being discussed? Include paths.
3. APPROACH: What solution strategy is being used?
4. PROGRESS: What has been done so far? What worked/didn't work?
5. BLOCKERS: Any errors, issues, or challenges encountered?
6. NEXT STEPS: What was about to be done when this summary was created?
7. KEY DETAILS: Any specific variable names, function names, line numbers, or technical details mentioned.

Be thorough - this summary will be used to restore context after a session timeout.

CONVERSATION:
`;

export interface MemoryManagerConfig {
	token: string;
	ollamaBaseUrl: string;
	summarizationModel: string;
	onSummaryGenerated?: (summary: string) => void;
	onError?: (error: string) => void;
}

export class GeminiMemoryManager {
	private session: GeminiSession | null = null;
	private config: MemoryManagerConfig;
	private messagesSinceLastSummary = 0;
	private summarizationTimer: ReturnType<typeof setInterval> | null = null;
	private transcriptBuffer: Array<{ role: string; content: string; audioDuration?: number }> = [];
	private isSummarizing = false;

	constructor(config: MemoryManagerConfig) {
		this.config = config;
	}

	/**
	 * Start a new memory session
	 */
	async startSession(model?: string, voice?: string): Promise<GeminiSession | null> {
		try {
			this.session = await createGeminiSession(this.config.token, model, voice);
			this.messagesSinceLastSummary = 0;
			this.transcriptBuffer = [];

			// Start periodic summarization
			this.startSummarizationTimer();

			return this.session;
		} catch (error) {
			this.config.onError?.(`Failed to start session: ${error}`);
			return null;
		}
	}

	/**
	 * Resume an existing session
	 */
	async resumeSession(sessionId: string): Promise<GeminiSessionContext | null> {
		try {
			const context = await getGeminiSessionContext(
				this.config.token,
				sessionId,
				TRANSCRIPT_CONTEXT_LIMIT
			);

			if (context?.session) {
				this.session = context.session;
				this.messagesSinceLastSummary = 0;
				this.startSummarizationTimer();
			}

			return context;
		} catch (error) {
			this.config.onError?.(`Failed to resume session: ${error}`);
			return null;
		}
	}

	/**
	 * Add a transcript entry
	 */
	async addTranscript(
		role: 'user' | 'assistant' | 'system',
		content: string,
		audioDuration?: number
	): Promise<GeminiTranscript | null> {
		if (!this.session) {
			this.config.onError?.('No active session');
			return null;
		}

		// Buffer the transcript locally
		this.transcriptBuffer.push({ role, content, audioDuration });

		try {
			const transcript = await addGeminiTranscript(
				this.config.token,
				this.session.id,
				role,
				content,
				audioDuration
			);

			if (transcript) {
				this.messagesSinceLastSummary++;

				// Check if we should trigger summarization
				if (this.messagesSinceLastSummary >= SUMMARIZATION_MESSAGE_THRESHOLD) {
					this.triggerSummarization();
				}
			}

			return transcript;
		} catch (error) {
			this.config.onError?.(`Failed to save transcript: ${error}`);
			return null;
		}
	}

	/**
	 * Trigger summarization via Ollama
	 */
	async triggerSummarization(): Promise<void> {
		if (this.isSummarizing || !this.session || this.transcriptBuffer.length === 0) {
			return;
		}

		this.isSummarizing = true;

		try {
			// Format conversation for summarization
			const conversationText = this.transcriptBuffer
				.map((t) => {
					const roleLabel = t.role === 'user' ? 'USER' : 'GEMINI';
					return `[${roleLabel}]: ${t.content}`;
				})
				.join('\n');

			const prompt = SUMMARIZATION_PROMPT + conversationText;

			// Call Ollama for summarization
			const summary = await this.callOllama(prompt);

			if (summary) {
				// Save summary to session
				await updateGeminiSession(this.config.token, this.session.id, { summary });

				this.messagesSinceLastSummary = 0;
				this.config.onSummaryGenerated?.(summary);
			}
		} catch (error) {
			this.config.onError?.(`Summarization failed: ${error}`);
		} finally {
			this.isSummarizing = false;
		}
	}

	/**
	 * Call Ollama API for text generation
	 */
	private async callOllama(prompt: string): Promise<string | null> {
		try {
			const response = await fetch(`${this.config.ollamaBaseUrl}/api/generate`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: this.config.summarizationModel,
					prompt: prompt,
					stream: false
				})
			});

			if (!response.ok) {
				throw new Error(`Ollama API error: ${response.status}`);
			}

			const data = await response.json();
			return data.response || null;
		} catch (error) {
			this.config.onError?.(`Ollama call failed: ${error}`);
			return null;
		}
	}

	/**
	 * Get context restoration prompt for reconnection
	 */
	async getContextForReconnection(): Promise<string | null> {
		if (!this.session) {
			return null;
		}

		try {
			const context = await getGeminiSessionContext(
				this.config.token,
				this.session.id,
				TRANSCRIPT_CONTEXT_LIMIT
			);

			return context?.context_prompt || null;
		} catch (error) {
			this.config.onError?.(`Failed to get context: ${error}`);
			return null;
		}
	}

	/**
	 * Mark session as timed out
	 */
	async markTimeout(): Promise<void> {
		if (!this.session) return;

		try {
			await updateGeminiSession(this.config.token, this.session.id, { status: 'timeout' });
		} catch (error) {
			this.config.onError?.(`Failed to mark timeout: ${error}`);
		}
	}

	/**
	 * End the session
	 */
	async endSession(): Promise<void> {
		this.stopSummarizationTimer();

		if (!this.session) return;

		try {
			// Do a final summarization before ending
			await this.triggerSummarization();

			await updateGeminiSession(this.config.token, this.session.id, { status: 'ended' });
		} catch (error) {
			this.config.onError?.(`Failed to end session: ${error}`);
		} finally {
			this.session = null;
			this.transcriptBuffer = [];
		}
	}

	/**
	 * Get current session
	 */
	getSession(): GeminiSession | null {
		return this.session;
	}

	/**
	 * Check if session is active
	 */
	isActive(): boolean {
		return this.session !== null && this.session.status === 'active';
	}

	/**
	 * Start the periodic summarization timer
	 */
	private startSummarizationTimer(): void {
		this.stopSummarizationTimer();

		this.summarizationTimer = setInterval(() => {
			if (this.transcriptBuffer.length > 0) {
				this.triggerSummarization();
			}
		}, SUMMARIZATION_INTERVAL_MS);
	}

	/**
	 * Stop the periodic summarization timer
	 */
	private stopSummarizationTimer(): void {
		if (this.summarizationTimer) {
			clearInterval(this.summarizationTimer);
			this.summarizationTimer = null;
		}
	}
}

/**
 * Generate a title from the first user message
 */
export function generateSessionTitle(firstMessage: string): string {
	// Take first 50 chars or first sentence, whichever is shorter
	const maxLength = 50;
	const firstSentence = firstMessage.split(/[.!?]/)[0];
	const title = firstSentence.length <= maxLength ? firstSentence : firstMessage.slice(0, maxLength);

	return title.trim() + (title.length < firstMessage.length ? '...' : '');
}

/**
 * Format duration in mm:ss
 */
export function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate time remaining until timeout (10 minutes)
 */
export function getTimeUntilTimeout(sessionStartTime: number): number {
	const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
	const elapsed = Date.now() - sessionStartTime;
	return Math.max(0, TIMEOUT_MS - elapsed);
}
