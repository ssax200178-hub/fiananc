import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// This script resets the password for the specified admin account
// USE WITH CAUTION. Delete after use.

const resetPassword = async () => {
    const email = 'abdr200178@financial.com';
    const newPassword = 'abdr200178pas@fin';

    try {
        console.log(`📡 Resetting password for: ${email}...`);

        // We need a service account to do this administratively
        // If not available, we might need another approach
        // But let's see if we can find one in the project directory

        const user = await admin.auth().getUserByEmail(email);
        await admin.auth().updateUser(user.uid, {
            password: newPassword
        });

        console.log('✅ Password updated successfully!');
    } catch (error) {
        console.error('❌ Failed to update password:', error);
    }
};

// Note: This script requires FIREBASE_CONFIG or a service account key
// Since I don't have the key file path readily, I'll check if I can use
// the firebase-tools CLI directly which might be already authenticated.
