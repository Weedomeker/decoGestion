const PROTOCOL = import.meta.env.VITE_PROTOCOL || "http";
const HOST = import.meta.env.VITE_HOST || "localhost";
const PORT = import.meta.env.VITE_PORT || "8000";
export const API_BASE = `${PROTOCOL}://${HOST}:${PORT}`;
