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
