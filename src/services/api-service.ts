import axios from 'axios';

// ฟังก์ชัน makeApiCall ที่ทำ POST request
export async function makeApiCall(url: string, requestBody: any): Promise<string> {
    try {
        const response = await axios.post(url, requestBody, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
        // แปลงข้อมูล JSON ที่ตอบกลับมาเป็น string
        return JSON.stringify(response.data);
    } catch (error) {
        console.error('Error making API call (POST):', error);
        return 'Error occurred';
    }
}

// ฟังก์ชัน makeGetApiCall ที่ทำ GET request
export async function makeGetApiCall(url: string): Promise<string> {
    try {
        const response = await axios.get(url);
        // แปลงข้อมูล JSON ที่ตอบกลับมาเป็น string
        return JSON.stringify(response.data);
    } catch (error) {
        console.error('Error making API call (GET):', error);
        return 'Error occurred';
    }
}
