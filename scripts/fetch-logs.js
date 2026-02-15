import { execSync } from 'child_process';
import fs from 'fs';

try {
    const output = execSync('npx -y firebase-tools firestore:get "projects/financial-tawseelone/databases/(default)/documents/app/v1_data/activity_logs" --project financial-tawseelone', { encoding: 'utf8' });
    fs.writeFileSync('logs_output.json', output);
    console.log('Logs fetched successfully');
} catch (e) {
    console.error('Error fetching logs:', e.message);
}
