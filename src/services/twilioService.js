const twilio = require('twilio');

class TwilioService {
    constructor() {
        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
            this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        } else {
            console.warn('Twilio credentials missing. SMS/WhatsApp alerts will not be sent.');
            this.client = null;
        }
    }

    formatMobile(mobile) {
        if (!mobile) return null;
        let formatted = mobile.trim();
        if (formatted.length === 10) {
            formatted = `+91${formatted}`;
        } else if (!formatted.startsWith('+')) {
            formatted = `+${formatted}`;
        }
        return formatted;
    }

    async sendSMS(to, body) {
        if (!this.client) return false;
        try {
            const formattedTo = this.formatMobile(to);
            const message = await this.client.messages.create({
                body: body,
                from: process.env.TWILIO_SMS_FROM,
                to: formattedTo
            });
            console.log(`[Twilio] SMS sent to ${formattedTo}. SID: ${message.sid}`);
            return true;
        } catch (error) {
            console.error(`[Twilio] Failed to send SMS to ${to}:`, error.message);
            return false;
        }
    }

    async sendWhatsApp(to, body) {
        if (!this.client) return false;
        try {
            const formattedTo = this.formatMobile(to);
            const message = await this.client.messages.create({
                body: body,
                from: process.env.TWILIO_WHATSAPP_FROM,
                to: `whatsapp:${formattedTo}`
            });
            console.log(`[Twilio] WhatsApp sent to ${formattedTo}. SID: ${message.sid}`);
            return true;
        } catch (error) {
            console.error(`[Twilio] Failed to send WhatsApp to ${to}:`, error.message);
            return false;
        }
    }
}

module.exports = new TwilioService();
