
const admin = require('firebase-admin');

// Note: This script assumes you have firebase-tools authenticated and can run commands.
// However, for direct Firestore access via MCP tool or admin SDK, we need credentials.
// Since I can run shell commands, I will use `npx firebase firestore:set`.

const fs = require('fs');

async function prepareUpdates() {
    const usersUpdate = [
        {
            id: '0',
            username: 'abdr200178',
            name: 'عبدالرحمن الصغير',
            role: 'super_admin',
            isActive: true,
            email: 'abdr200178@financial.com'
        }
    ];

    // For prod (app)
    const prodPatch = { users: usersUpdate };
    fs.writeFileSync('prod_patch.json', JSON.stringify(prodPatch, null, 2));

    // For staging (app_staging)
    const stagingPatch = { users: usersUpdate };
    fs.writeFileSync('staging_patch.json', JSON.stringify(stagingPatch, null, 2));

    console.log("Patches prepared.");
}

prepareUpdates();
