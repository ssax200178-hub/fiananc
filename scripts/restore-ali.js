const { execSync } = require('child_process');
const fs = require('fs');

// Data for Ali Al-Khamisi from staging
const ali = {
    id: "1770949709982-jltq0r18e",
    permissions: ["manage_restaurants", "manage_funds", "view_history", "manage_tips", "view_dashboard"],
    username: "ail2@financial.com",
    email: "ail2@financial.com",
    role: "admin",
    isActive: true,
    name: "علي الخميسي"
};

async function patch() {
    console.log('Fetching current production data...');
    // We can't easily get JSON from the MCP output here, so we will use firebase-tools to get the REAL JSON.
    try {
        const currentDataRaw = execSync('npx -y firebase-tools firestore:get "app/v1_data" --project financial-tawseelone -j', { encoding: 'utf8' });
        const currentData = JSON.parse(currentDataRaw).data;

        // Add Ali if not exists
        if (!currentData.customUsers) currentData.customUsers = [];
        const exists = currentData.customUsers.find(u => u.email === ali.email);

        if (!exists) {
            currentData.customUsers.push(ali);
            console.log('Adding Ali Al-Khamisi to customUsers...');
        } else {
            console.log('Ali Al-Khamisi already exists in customUsers.');
        }

        // Write to temp file
        fs.writeFileSync('restore_patch.json', JSON.stringify(currentData, null, 2));

        console.log('Applying patch to Firestore...');
        execSync('npx -y firebase-tools firestore:set "app/v1_data" restore_patch.json --project financial-tawseelone --non-interactive', { stdio: 'inherit' });

        console.log('✅ Restoration complete.');
    } catch (e) {
        console.error('❌ Restoration failed:', e.message);
    }
}

patch();
