import api from '../api';

/**
 * Service wrapper for stateful Chatbot Session APIs.
 * Note: Under the axios response interceptor, responses with a 'data' field
 * return the value of 'data' directly.
 */
export const getSessions = async () => {
  return await api.get('/chat/sessions');
};

export const createSession = async (title) => {
  return await api.post('/chat/sessions', { title });
};

export const renameSession = async (sessionId, title) => {
  return await api.patch(`/chat/sessions/${sessionId}`, { title });
};

export const deleteSession = async (sessionId) => {
  return await api.delete(`/chat/sessions/${sessionId}`);
};

export const getSessionMessages = async (sessionId, page = 1, limit = 50) => {
  return await api.get(`/chat/sessions/${sessionId}/messages`, {
    params: { page, limit }
  });
};

export const sendMessageToSession = async (sessionId, message) => {
  // We return the raw response, but axios interceptor returns response.data.data (the ChatMessage).
  // In order to read limits and structured fields, we can access the underlying axios response if needed.
  // However, since the message's content is stringified JSON for structured responses, 
  // the frontend's render loop can parse it from message.content directly.
  return await api.post(`/chat/sessions/${sessionId}/messages`, { message });
};
