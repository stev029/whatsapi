import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000'; // Ganti jika backend Anda di port lain

// Fungsi helper untuk menambahkan header Authorization
const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
        headers: {
            Authorization: `Bearer ${token}`
        }
    };
};

// Fungsi helper untuk menambahkan header Session Token
const getSessionHeaders = (sessionToken) => {
    return {
        headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'X-Session-Token': sessionToken
        }
    };
};

export const addWhatsappSession = async (phoneNumber) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/whatsapp/add-session`, { phoneNumber }, getAuthHeaders());
        return response.data;
    } catch (error) {
        throw error.response?.data?.error || 'Failed to add WhatsApp session';
    }
};

export const getWhatsappSessionsStatus = async () => {
    try {
        const response = await axios.get(`${API_BASE_URL}/whatsapp/status`, getAuthHeaders());
        return response.data; // Objek { phoneNumber: { status, qr, info, secretToken } }
    } catch (error) {
        throw error.response?.data?.error || 'Failed to get WhatsApp sessions status';
    }
};

export const sendWhatsappMessage = async (sessionToken, targetNumber, message) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/whatsapp/send-message`, { targetNumber, message }, getSessionHeaders(sessionToken));
        return response.data;
    } catch (error) {
        throw error.response?.data?.error || 'Failed to send message';
    }
};

export const deleteWhatsappSession = async (phoneNumber) => {
    try {
        const response = await axios.delete(`${API_BASE_URL}/whatsapp/delete-session/${phoneNumber}`, getAuthHeaders());
        return response.data;
    } catch (error) {
        throw error.response?.data?.error || 'Failed to delete session';
    }
};

// Fungsi untuk mengirim media (belum lengkap, perlu penanganan file upload)
export const sendWhatsappMedia = async (sessionToken, targetNumber, formData) => { // formData harus berisi file
    try {
        const response = await axios.post(`${API_BASE_URL}/whatsapp/send-media`, formData, {
            headers: {
                ...getSessionHeaders(sessionToken).headers,
                'Content-Type': 'multipart/form-data' // Penting untuk upload file
            }
        });
        return response.data;
    } catch (error) {
        throw error.response?.data?.error || 'Failed to send media';
    }
};