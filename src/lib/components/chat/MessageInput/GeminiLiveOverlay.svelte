<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, getContext } from 'svelte';
	import { showGeminiLiveOverlay, geminiLiveState } from '$lib/stores';
	import { getGeminiApiKeyForLive, getGeminiLiveModels } from '$lib/apis/gemini';
	import { toast } from 'svelte-sonner';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import VideoInputMenu from './CallOverlay/VideoInputMenu.svelte';
	import {
		GeminiMemoryManager,
		formatDuration,
		getTimeUntilTimeout,
		generateSessionTitle
	} from '$lib/utils/geminiMemory';
	import { OLLAMA_API_BASE_URL } from '$lib/constants';

	const i18n = getContext('i18n');
	const dispatch = createEventDispatcher();

	export let chatId: string;
	export let modelId: string;

	// Memory manager for persistent context
	let memoryManager: GeminiMemoryManager | null = null;
	let isRestoringContext = false;
	let lastContextSaveTime = 0;
	let sessionTimer: ReturnType<typeof setInterval> | null = null;
	let timeRemaining = 10 * 60; // 10 minutes in seconds
	let reconnectAttempt = 0;

	// WebSocket and audio refs
	let ws: WebSocket | null = null;
	let audioContext: AudioContext | null = null;
	let audioWorklet: AudioWorkletNode | null = null;
	let audioStream: MediaStream | null = null;
	let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
	let sessionStart = 0;

	// Video
	let camera = false;
	let cameraStream: MediaStream | null = null;
	let videoInputDevices: MediaDeviceInfo[] = [];
	let selectedVideoInputDeviceId: string | null = null;
	let videoFrameInterval: ReturnType<typeof setInterval> | null = null;

	// Audio playback queue
	let audioPlaybackQueue: ArrayBuffer[] = [];
	let isPlayingAudio = false;

	// UI state
	let rmsLevel = 0;
	let wakeLock: WakeLockSentinel | null = null;

	// Config from backend
	let apiKey = '';
	let voice = 'Aoede';
	let liveModels: string[] = [];

	const log = (level: 'info' | 'warn' | 'error', message: string) => {
		console[level](`[GeminiLive] ${message}`);
	};

	const getVideoInputDevices = async () => {
		const devices = await navigator.mediaDevices.enumerateDevices();
		videoInputDevices = devices.filter((device) => device.kind === 'videoinput');

		if (navigator.mediaDevices.getDisplayMedia) {
			videoInputDevices = [
				...videoInputDevices,
				{ deviceId: 'screen', label: 'Screen Share' } as MediaDeviceInfo
			];
		}

		if (selectedVideoInputDeviceId === null && videoInputDevices.length > 0) {
			selectedVideoInputDeviceId = videoInputDevices[0].deviceId;
		}
	};

	const startCamera = async () => {
		await getVideoInputDevices();
		if (cameraStream === null) {
			camera = true;
			try {
				await startVideoStream();
			} catch (err) {
				console.error('Error accessing webcam:', err);
				toast.error('Failed to access camera');
			}
		}
	};

	const startVideoStream = async () => {
		const video = document.getElementById('gemini-camera-feed') as HTMLVideoElement;
		if (video) {
			try {
				if (selectedVideoInputDeviceId === 'screen') {
					cameraStream = await navigator.mediaDevices.getDisplayMedia({
						video: { cursor: 'always' } as any,
						audio: false
					});
				} else {
					cameraStream = await navigator.mediaDevices.getUserMedia({
						video: {
							deviceId: selectedVideoInputDeviceId ? { exact: selectedVideoInputDeviceId } : undefined,
							width: { ideal: 1920 },
							height: { ideal: 1080 }
						}
					});
				}

				if (cameraStream) {
					await getVideoInputDevices();
					video.srcObject = cameraStream;
					await video.play();
					geminiLiveState.update((s) => ({ ...s, isVideoEnabled: true }));

					// Start sending video frames
					startVideoFrameCapture();
				}
			} catch (err) {
				console.error('Error starting video stream:', err);
			}
		}
	};

	const stopVideoStream = async () => {
		if (videoFrameInterval) {
			clearInterval(videoFrameInterval);
			videoFrameInterval = null;
		}

		if (cameraStream) {
			cameraStream.getTracks().forEach((track) => track.stop());
			cameraStream = null;
		}

		geminiLiveState.update((s) => ({ ...s, isVideoEnabled: false }));
	};

	const startVideoFrameCapture = () => {
		if (videoFrameInterval) return;

		// Send video frames at 1 FPS (to stay within API limits)
		videoFrameInterval = setInterval(() => {
			if (ws?.readyState === WebSocket.OPEN && cameraStream) {
				const video = document.getElementById('gemini-camera-feed') as HTMLVideoElement;
				const canvas = document.getElementById('gemini-camera-canvas') as HTMLCanvasElement;

				if (video && canvas) {
					const ctx = canvas.getContext('2d');
					canvas.width = Math.min(video.videoWidth, 1280);
					canvas.height = Math.min(video.videoHeight, 720);

					ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

					const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
					const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

					ws.send(
						JSON.stringify({
							realtimeInput: {
								mediaChunks: [
									{
										mimeType: 'image/jpeg',
										data: base64Data
									}
								]
							}
						})
					);
				}
			}
		}, 1000);
	};

	const stopCamera = async () => {
		await stopVideoStream();
		camera = false;
	};

	const initializeMemoryManager = () => {
		if (!memoryManager) {
			memoryManager = new GeminiMemoryManager({
				token: localStorage.token,
				ollamaBaseUrl: OLLAMA_API_BASE_URL,
				summarizationModel: 'llama3.2', // TODO: Make configurable
				onSummaryGenerated: (summary) => {
					log('info', 'Context summary generated');
					lastContextSaveTime = Date.now();
					toast.success('Context saved', { duration: 2000 });
				},
				onError: (error) => {
					log('error', `Memory manager error: ${error}`);
				}
			});
		}
	};

	const startSessionTimer = () => {
		if (sessionTimer) clearInterval(sessionTimer);
		timeRemaining = 10 * 60;

		sessionTimer = setInterval(() => {
			timeRemaining = Math.max(0, Math.floor(getTimeUntilTimeout(sessionStart) / 1000));

			// Warning at 1 minute remaining
			if (timeRemaining === 60) {
				toast.warning('Session timeout in 1 minute', { duration: 5000 });
			}

			// Timeout imminent - trigger save
			if (timeRemaining === 10) {
				memoryManager?.triggerSummarization();
			}
		}, 1000);
	};

	const stopSessionTimer = () => {
		if (sessionTimer) {
			clearInterval(sessionTimer);
			sessionTimer = null;
		}
	};

	const connectToGeminiLive = async () => {
		if (!apiKey) {
			toast.error('No Gemini API key configured');
			return;
		}

		geminiLiveState.update((s) => ({ ...s, isConnecting: true }));
		log('info', `Connecting to Gemini Live API with model: ${$geminiLiveState.currentModel}`);

		// Initialize memory manager if needed
		initializeMemoryManager();

		// Check for existing session to restore
		let contextPrompt = '';
		if (reconnectAttempt > 0 && memoryManager?.isActive()) {
			log('info', 'Attempting context restoration...');
			isRestoringContext = true;
			const context = await memoryManager.getContextForReconnection();
			if (context) {
				contextPrompt = context;
				log('info', 'Context loaded for restoration');
			}
		}

		try {
			const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

			ws = new WebSocket(wsUrl);

			ws.onopen = async () => {
				log('info', 'WebSocket connected, sending setup...');
				sessionStart = Date.now();

				// Build system instruction with context restoration if available
				let systemText = `You are a helpful AI assistant. Respond naturally and conversationally. The user has dyslexia and prefers audio responses, so be clear and speak naturally.`;

				if (contextPrompt) {
					systemText = contextPrompt + '\n\n' + systemText;
					log('info', 'Context injected into system instruction');
				}

				const setupMessage = {
					setup: {
						model: `models/${$geminiLiveState.currentModel}`,
						generationConfig: {
							responseModalities: ['AUDIO', 'TEXT'],
							speechConfig: {
								voiceConfig: {
									prebuiltVoiceConfig: {
										voiceName: voice
									}
								}
							}
						},
						systemInstruction: {
							parts: [{ text: systemText }]
						}
					}
				};

				ws?.send(JSON.stringify(setupMessage));
				geminiLiveState.update((s) => ({ ...s, isConnected: true, isConnecting: false }));
				log('info', 'Setup sent, connection established!');

				// Start a new memory session or continue existing one
				if (!memoryManager?.isActive()) {
					await memoryManager?.startSession($geminiLiveState.currentModel, voice);
					log('info', 'New memory session started');
				}

				// Start session timer
				startSessionTimer();

				// Reset reconnect counter on successful connection
				reconnectAttempt = 0;
				isRestoringContext = false;

				// Start audio capture
				startAudioCapture();
			};

			ws.onmessage = async (event) => {
				try {
					const data = JSON.parse(event.data);

					if (data.setupComplete) {
						log('info', 'Setup complete acknowledged by server');
					}

					if (data.serverContent?.modelTurn?.parts) {
						for (const part of data.serverContent.modelTurn.parts) {
							if (part.text) {
								geminiLiveState.update((s) => ({
									...s,
									transcript: [
										...s.transcript,
										{ role: 'assistant', content: part.text, timestamp: Date.now() }
									]
								}));

								// Save assistant response to memory
								memoryManager?.addTranscript('assistant', part.text);

								// Generate title from first meaningful response if no title yet
								const session = memoryManager?.getSession();
								if (session && !session.title && part.text.length > 10) {
									// Title will be auto-generated on first user message
								}
							}
							if (part.inlineData?.mimeType?.startsWith('audio/')) {
								const audioData = Uint8Array.from(atob(part.inlineData.data), (c) =>
									c.charCodeAt(0)
								);
								queueAudioPlayback(audioData.buffer);
							}
						}
					}

					if (data.error) {
						log('error', `Server error: ${JSON.stringify(data.error)}`);
						toast.error(`Gemini error: ${data.error.message || 'Unknown error'}`);
					}
				} catch (err) {
					log('error', `Parse error: ${err}`);
				}
			};

			ws.onerror = (error) => {
				log('error', `WebSocket error`);
				geminiLiveState.update((s) => ({ ...s, isConnecting: false }));
				toast.error('Connection error');
			};

			ws.onclose = async (event) => {
				log('warn', `WebSocket closed: code=${event.code}, reason=${event.reason || 'none'}`);
				geminiLiveState.update((s) => ({ ...s, isConnected: false, isConnecting: false }));
				stopSessionTimer();

				const sessionDuration = Date.now() - sessionStart;

				// Check if this was likely a timeout (close to 10 minutes)
				const wasTimeout = sessionDuration > 9 * 60 * 1000;

				if (wasTimeout && memoryManager?.isActive()) {
					log('info', 'Session likely timed out, marking as timeout');
					await memoryManager.markTimeout();
				}

				if (sessionDuration > 5000 && event.code !== 1000 && $showGeminiLiveOverlay) {
					log('info', 'Unexpected disconnect, attempting reconnect in 2s...');
					reconnectAttempt++;

					// Show toast about reconnection
					if (wasTimeout) {
						toast.info('Session timed out. Reconnecting with context...', { duration: 3000 });
					} else {
						toast.info('Connection lost. Reconnecting...', { duration: 2000 });
					}

					reconnectTimeout = setTimeout(() => {
						connectToGeminiLive();
					}, 2000);
				}
			};
		} catch (error) {
			log('error', `Connection error: ${error}`);
			geminiLiveState.update((s) => ({ ...s, isConnecting: false }));
			toast.error('Failed to connect');
		}
	};

	const startAudioCapture = async () => {
		try {
			audioStream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
					sampleRate: 16000
				}
			});

			audioContext = new AudioContext({ sampleRate: 16000 });

			await audioContext.audioWorklet.addModule('/audio/gemini-audio-processor.js');

			const source = audioContext.createMediaStreamSource(audioStream);
			audioWorklet = new AudioWorkletNode(audioContext, 'gemini-audio-processor');

			audioWorklet.port.onmessage = (event) => {
				if (event.data.type === 'audio' && ws?.readyState === WebSocket.OPEN && !$geminiLiveState.isMuted) {
					const base64Audio = btoa(String.fromCharCode(...new Uint8Array(event.data.data)));
					ws.send(
						JSON.stringify({
							realtimeInput: {
								mediaChunks: [
									{
										mimeType: 'audio/pcm;rate=16000',
										data: base64Audio
									}
								]
							}
						})
					);
				}
			};

			source.connect(audioWorklet);

			// Set up RMS level monitoring
			const analyser = audioContext.createAnalyser();
			source.connect(analyser);
			analyser.fftSize = 256;
			const dataArray = new Uint8Array(analyser.frequencyBinCount);

			const updateRms = () => {
				if (!$showGeminiLiveOverlay) return;
				analyser.getByteTimeDomainData(dataArray);
				let sumSquares = 0;
				for (let i = 0; i < dataArray.length; i++) {
					const normalized = (dataArray[i] - 128) / 128;
					sumSquares += normalized * normalized;
				}
				rmsLevel = Math.sqrt(sumSquares / dataArray.length);
				requestAnimationFrame(updateRms);
			};
			updateRms();

			log('info', 'Audio capture started');
		} catch (error) {
			log('error', `Failed to start audio capture: ${error}`);
			toast.error('Failed to access microphone');
		}
	};

	const stopAudioCapture = () => {
		if (audioWorklet) {
			audioWorklet.disconnect();
			audioWorklet = null;
		}

		if (audioStream) {
			audioStream.getTracks().forEach((track) => track.stop());
			audioStream = null;
		}

		if (audioContext) {
			audioContext.close();
			audioContext = null;
		}
	};

	const queueAudioPlayback = (audioData: ArrayBuffer) => {
		audioPlaybackQueue.push(audioData);
		if (!isPlayingAudio) {
			playNextAudio();
		}
	};

	const playNextAudio = async () => {
		if (audioPlaybackQueue.length === 0) {
			isPlayingAudio = false;
			return;
		}

		isPlayingAudio = true;
		const audioData = audioPlaybackQueue.shift()!;

		try {
			const playbackContext = new AudioContext({ sampleRate: 24000 });
			const pcm16 = new Int16Array(audioData);
			const float32 = new Float32Array(pcm16.length);

			for (let i = 0; i < pcm16.length; i++) {
				float32[i] = pcm16[i] / 32768;
			}

			const buffer = playbackContext.createBuffer(1, float32.length, 24000);
			buffer.getChannelData(0).set(float32);

			const source = playbackContext.createBufferSource();
			source.buffer = buffer;
			source.connect(playbackContext.destination);

			source.onended = () => {
				playbackContext.close();
				playNextAudio();
			};

			source.start();
		} catch (error) {
			log('error', `Audio playback error: ${error}`);
			playNextAudio();
		}
	};

	const disconnect = () => {
		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
			reconnectTimeout = null;
		}

		if (ws) {
			ws.close(1000, 'User requested disconnect');
			ws = null;
		}

		stopAudioCapture();
		stopCamera();
		stopSessionTimer();

		geminiLiveState.update((s) => ({ ...s, isConnected: false }));
		log('info', 'Disconnected');
	};

	const toggleMute = () => {
		geminiLiveState.update((s) => ({ ...s, isMuted: !s.isMuted }));
	};

	const closeOverlay = async () => {
		disconnect();

		// End the memory session properly
		if (memoryManager?.isActive()) {
			log('info', 'Ending memory session...');
			await memoryManager.endSession();
		}

		showGeminiLiveOverlay.set(false);
		dispatch('close');
	};

	onMount(async () => {
		// Request wake lock to keep screen on
		if ('wakeLock' in navigator) {
			try {
				wakeLock = await navigator.wakeLock.request('screen');
			} catch (err) {
				console.log('Wake lock error:', err);
			}
		}

		// Fetch API key and config from backend
		try {
			const keyResponse = await getGeminiApiKeyForLive(localStorage.token);
			if (keyResponse) {
				apiKey = keyResponse.api_key;
				voice = keyResponse.voice;
			}

			const modelsResponse = await getGeminiLiveModels(localStorage.token);
			if (modelsResponse?.models) {
				liveModels = modelsResponse.models.map((m) => m.id);
				if (liveModels.length > 0) {
					geminiLiveState.update((s) => ({ ...s, currentModel: liveModels[0], voice }));
				}
			}
		} catch (error) {
			console.error('Failed to fetch Gemini config:', error);
			toast.error('Failed to load Gemini configuration');
		}

		// Auto-connect
		if (apiKey) {
			connectToGeminiLive();
		}
	});

	onDestroy(async () => {
		disconnect();

		if (wakeLock) {
			await wakeLock.release();
			wakeLock = null;
		}
	});
</script>

{#if $showGeminiLiveOverlay}
	<div
		class="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
		role="dialog"
		aria-modal="true"
	>
		<div class="max-w-lg w-full h-full max-h-[100dvh] flex flex-col justify-between p-3 md:p-6">
			<!-- Video preview or avatar -->
			{#if camera}
				<div class="relative flex-1 flex items-center justify-center">
					<video
						id="gemini-camera-feed"
						autoplay
						playsinline
						muted
						class="rounded-2xl max-h-full max-w-full object-contain"
					/>
					<canvas id="gemini-camera-canvas" class="hidden" />

					<button
						type="button"
						class="absolute top-4 left-4 p-2 text-white backdrop-blur-xl bg-black/30 rounded-full hover:bg-black/50"
						on:click={stopCamera}
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
							<path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
						</svg>
					</button>
				</div>
			{:else}
				<div class="flex-1 flex items-center justify-center">
					<div
						class="transition-all duration-200 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-4xl"
						style="width: {$geminiLiveState.isConnected ? 160 + rmsLevel * 80 : 160}px; height: {$geminiLiveState.isConnected ? 160 + rmsLevel * 80 : 160}px;"
					>
						{#if $geminiLiveState.isConnecting}
							<svg class="animate-spin size-12" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
							</svg>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-16">
								<path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
								<path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
							</svg>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Status bar with timer -->
			<div class="flex items-center justify-between text-white text-sm py-2 px-4">
				<!-- Status text -->
				<div class="flex items-center gap-2">
					{#if isRestoringContext}
						<div class="flex items-center gap-2">
							<svg class="animate-spin size-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
							</svg>
							<span class="text-blue-400">Restoring context...</span>
						</div>
					{:else if $geminiLiveState.isConnecting}
						Connecting...
					{:else if $geminiLiveState.isConnected}
						{#if $geminiLiveState.isMuted}
							<span class="text-red-400">Muted</span>
						{:else}
							<span class="text-green-400">● Live</span>
						{/if}
					{:else}
						<span class="text-gray-400">Disconnected</span>
					{/if}
				</div>

				<!-- Timer and context indicator -->
				<div class="flex items-center gap-3">
					{#if lastContextSaveTime > 0}
						<Tooltip content="Context saved">
							<div class="flex items-center gap-1 text-green-400 text-xs">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
									<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
								</svg>
								<span>Saved</span>
							</div>
						</Tooltip>
					{/if}

					{#if $geminiLiveState.isConnected && timeRemaining > 0}
						<div
							class="font-mono text-xs px-2 py-1 rounded {timeRemaining <= 60 ? 'bg-red-600/50 text-red-200' : 'bg-gray-700/50'}"
						>
							{formatDuration(timeRemaining)}
						</div>
					{/if}
				</div>
			</div>

			<!-- Transcript (last few messages) -->
			{#if $geminiLiveState.transcript.length > 0}
				<div class="bg-black/30 rounded-lg p-3 max-h-32 overflow-y-auto mb-4">
					{#each $geminiLiveState.transcript.slice(-3) as message}
						<p class="text-white/80 text-sm mb-1">
							<span class="font-semibold text-white">{message.role === 'user' ? 'You' : 'AI'}:</span>
							{message.content.slice(0, 100)}{message.content.length > 100 ? '...' : ''}
						</p>
					{/each}
				</div>
			{/if}

			<!-- Controls -->
			<div class="flex justify-between items-center pb-2 w-full">
				<!-- Camera toggle -->
				<div>
					{#if camera}
						<VideoInputMenu
							devices={videoInputDevices}
							on:change={async (e) => {
								selectedVideoInputDeviceId = e.detail;
								await stopVideoStream();
								await startVideoStream();
							}}
						>
							<button class="p-3 rounded-full bg-gray-700/50 hover:bg-gray-600/50 text-white" type="button">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
									<path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clip-rule="evenodd" />
								</svg>
							</button>
						</VideoInputMenu>
					{:else}
						<Tooltip content="Camera">
							<button
								class="p-3 rounded-full bg-gray-700/50 hover:bg-gray-600/50 text-white"
								type="button"
								on:click={startCamera}
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
								</svg>
							</button>
						</Tooltip>
					{/if}
				</div>

				<!-- Mute toggle -->
				<div>
					<Tooltip content={$geminiLiveState.isMuted ? 'Unmute' : 'Mute'}>
						<button
							class="p-4 rounded-full {$geminiLiveState.isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700/50 hover:bg-gray-600/50'} text-white"
							type="button"
							on:click={toggleMute}
						>
							{#if $geminiLiveState.isMuted}
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6">
									<path d="M3.53 2.47a.75.75 0 0 0-1.06 1.06l18 18a.75.75 0 1 0 1.06-1.06l-18-18ZM20.57 16.476c-.223.082-.448.161-.674.238L7.319 4.137A6.75 6.75 0 0 1 18.75 9v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 0 1-.297 1.206Z" />
									<path fill-rule="evenodd" d="M5.25 9c0-.184.007-.366.022-.546l10.384 10.384a3.751 3.751 0 0 1-7.396-1.119 24.585 24.585 0 0 1-4.831-1.244.75.75 0 0 1-.298-1.205A8.217 8.217 0 0 0 5.25 9.75V9Zm4.502 8.9a2.25 2.25 0 1 0 4.496 0 25.057 25.057 0 0 1-4.496 0Z" clip-rule="evenodd" />
								</svg>
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6">
									<path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
									<path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
								</svg>
							{/if}
						</button>
					</Tooltip>
				</div>

				<!-- Close button -->
				<div>
					<button
						class="p-3 rounded-full bg-red-600 hover:bg-red-700 text-white"
						on:click={closeOverlay}
						type="button"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
							<path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
						</svg>
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
