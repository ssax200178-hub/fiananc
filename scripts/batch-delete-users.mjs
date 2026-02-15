const token = "ya29.a0AUMWg_Ln5AOD5P-vVQ46jFK2qDOlVv-mg46p3N_VkILbwTy0aiF3sqlkxTxQzpkh2Am7JVFwPOP0MTbNhxmu8OES92LwYhKc6BfUwGdOYF86sdozja0J_B5L5EC3zigxIS-ud4NomZRXiuD7FNRKGjf1UGDo9chA-sEgOlSc3zuPok3qSCTjwYD6d9kaTjMbhaoDD9ShtcNeZQaCgYKAY0SARUSFQHGX2MieA6mGV6RRmlpFy8NcfZHRw0213";
const projectId = "financial-tawseelone";
const uids = ["08GEfp8TUgaXHTEj9xxxbyZmEzc2", "3XNpRDmSZCY3LO0HRdDrAruzfS03", "VvzvustEDKP1GVoNBgJ6DAPwwZV2", "WXNwyXdXE4fFJWW357OVuwBZISv2", "s7KqJj0xH0O6n3U7HdDli4lG5r23"];

async function run() {
    console.log("🚀 Deleting users from Auth individually...");
    for (const uid of uids) {
        const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:delete`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ localId: uid })
        });

        const data = await res.json();
        console.log(`🧹 Deleted UID ${uid}:`, JSON.stringify(data));
    }
    console.log("✅ All requested users deleted from Auth.");
}

run().catch(console.error);
