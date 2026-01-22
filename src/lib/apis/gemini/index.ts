import { GEMINI_API_BASE_URL } from '$lib/constants';

export interface GeminiConfig {
	api_keys: string[];
	live_enabled: boolean;
	live_voice: string;
	live_voices: string[];
	live_models: string[];
}

export interface GeminiUserConfig {
	enabled: boolean;
	live_voice: string;
	live_voices: string[];
	live_models: string[];
}

export interface GeminiModel {
	id: string;
	name: string;
	description?: string;
	input_token_limit?: number;
	output_token_limit?: number;
	supports_live: boolean;
}

export interface GeminiLiveConfig {
	models: GeminiModel[];
	enabled: boolean;
	voice: string;
	voices: string[];
}

export interface GeminiApiKeyResponse {
	api_key: string;
	voice: string;
}

// Session and Transcript interfaces for persistent memory
export interface GeminiSession {
	id: string;
	user_id: string;
	title: string | null;
	summary: string | null;
	status: 'active' | 'timeout' | 'ended';
	model: string | null;
	voice: string | null;
	message_count: number;
	last_summary_at: number | null;
	updated_at: number;
	created_at: number;
}

export interface GeminiTranscript {
	id: string;
	session_id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	audio_duration: number | null;
	timestamp: number;
}

export interface GeminiSessionContext {
	session: GeminiSession;
	transcripts: GeminiTranscript[];
	formatted_transcripts: string;
	context_prompt: string;
}

// Admin: Get full Gemini configuration
export const getGeminiConfig = async (token: string = ''): Promise<GeminiConfig | null> => {
	let error = null;

	const res = await fetch(`${GEMINI_API_BASE_URL}/config`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// Admin: Update Gemini configuration
export const updateGeminiConfig = async (
	token: string = '',
	config: { api_keys: string[]; live_enabled: boolean; live_voice: string }
): Promise<GeminiConfig | null> => {
	let error = null;

	const res = await fetch(`${GEMINI_API_BASE_URL}/config/update`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		},
		body: JSON.stringify(config)
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// User: Get limited Gemini configuration
export const getGeminiUserConfig = async (token: string = ''): Promise<GeminiUserConfig | null> => {
	let error = null;

	const res = await fetch(`${GEMINI_API_BASE_URL}/config/user`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// Admin: Verify Gemini API connection
export const verifyGeminiConnection = async (token: string = ''): Promise<{ status: string; message: string } | null> => {
	let error = null;

	const res = await fetch(`${GEMINI_API_BASE_URL}/verify`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// User: Get available Gemini models
export const getGeminiModels = async (token: string = ''): Promise<{ models: GeminiModel[] } | null> => {
	let error = null;

	const res = await fetch(`${GEMINI_API_BASE_URL}/models`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// User: Get Gemini Live models
export const getGeminiLiveModels = async (token: string = ''): Promise<GeminiLiveConfig | null> => {
	let error = null;

	const res = await fetch(`${GEMINI_API_BASE_URL}/models/live`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// User: Get API key for Live connections
export const getGeminiApiKeyForLive = async (token: string = ''): Promise<GeminiApiKeyResponse | null> => {
	let error = null;

	const res = await fetch(`${GEMINI_API_BASE_URL}/api-key`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// ====================================
// Session Management API Functions
// ====================================

// Create a new Gemini Live session
export const createGeminiSession = async (
	token: string = '',
	model?: string,
	voice?: string
): Promise<GeminiSession | null> => {
	let error = null;

	const res = await fetch(`${GEMINI_API_BASE_URL}/session`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		},
		body: JSON.stringify({ model, voice })
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// Get a specific session by ID
export const getGeminiSession = async (
	token: string = '',
	sessionId: string
): Promise<GeminiSession | null> => {
	let error = null;

	const res = await fetch(`${GEMINI_API_BASE_URL}/session/${sessionId}`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// Get all sessions for the current user
export const getGeminiSessions = async (
	token: string = '',
	limit: number = 50,
	offset: number = 0
): Promise<{ sessions: GeminiSession[] } | null> => {
	let error = null;

	const res = await fetch(`${GEMINI_API_BASE_URL}/sessions?limit=${limit}&offset=${offset}`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// Get the active session for the current user
export const getActiveGeminiSession = async (
	token: string = ''
): Promise<{ session: GeminiSession | null } | null> => {
	let error = null;

	const res = await fetch(`${GEMINI_API_BASE_URL}/session/active`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// Update a session (title, summary, status)
export const updateGeminiSession = async (
	token: string = '',
	sessionId: string,
	updates: { title?: string; summary?: string; status?: string }
): Promise<GeminiSession | null> => {
	let error = null;

	const res = await fetch(`${GEMINI_API_BASE_URL}/session/${sessionId}`, {
		method: 'PUT',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		},
		body: JSON.stringify(updates)
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// Delete a session and all its transcripts
export const deleteGeminiSession = async (
	token: string = '',
	sessionId: string
): Promise<{ status: string; message: string } | null> => {
	let error = null;

	const res = await fetch(`${GEMINI_API_BASE_URL}/session/${sessionId}`, {
		method: 'DELETE',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// ====================================
// Transcript Management API Functions
// ====================================

// Add a transcript entry to a session
export const addGeminiTranscript = async (
	token: string = '',
	sessionId: string,
	role: 'user' | 'assistant' | 'system',
	content: string,
	audioDuration?: number
): Promise<GeminiTranscript | null> => {
	let error = null;

	const res = await fetch(`${GEMINI_API_BASE_URL}/transcript`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		},
		body: JSON.stringify({
			session_id: sessionId,
			role,
			content,
			audio_duration: audioDuration
		})
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// Get all transcripts for a session
export const getGeminiTranscripts = async (
	token: string = '',
	sessionId: string,
	limit: number = 100,
	offset: number = 0
): Promise<{ transcripts: GeminiTranscript[] } | null> => {
	let error = null;

	const res = await fetch(
		`${GEMINI_API_BASE_URL}/transcripts/${sessionId}?limit=${limit}&offset=${offset}`,
		{
			method: 'GET',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				...(token && { authorization: `Bearer ${token}` })
			}
		}
	)
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// Get recent transcripts for context restoration
export const getRecentGeminiTranscripts = async (
	token: string = '',
	sessionId: string,
	limit: number = 50
): Promise<{ transcripts: GeminiTranscript[]; formatted: string; count: number } | null> => {
	let error = null;

	const res = await fetch(`${GEMINI_API_BASE_URL}/transcripts/${sessionId}/recent?limit=${limit}`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// ====================================
// Context Restoration API Function
// ====================================

// Get full session context for restoration after timeout
export const getGeminiSessionContext = async (
	token: string = '',
	sessionId: string,
	transcriptLimit: number = 50
): Promise<GeminiSessionContext | null> => {
	let error = null;

	const res = await fetch(
		`${GEMINI_API_BASE_URL}/context/${sessionId}?transcript_limit=${transcriptLimit}`,
		{
			method: 'GET',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				...(token && { authorization: `Bearer ${token}` })
			}
		}
	)
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};
