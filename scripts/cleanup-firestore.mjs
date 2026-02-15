const token = "ya29.a0AUMWg_Ln5AOD5P-vVQ46jFK2qDOlVv-mg46p3N_VkILbwTy0aiF3sqlkxTxQzpkh2Am7JVFwPOP0MTbNhxmu8OES92LwYhKc6BfUwGdOYF86sdozja0J_B5L5EC3zigxIS-ud4NomZRXiuD7FNRKGjf1UGDo9chA-sEgOlSc3zuPok3qSCTjwYD6d9kaTjMbhaoDD9ShtcNeZQaCgYKAY0SARUSFQHGX2MieA6mGV6RRmlpFy8NcfZHRw0213";
const projectId = "financial-tawseelone";

async function run() {
    console.log("🚀 Cleaning up Firestore...");
    // Use PATCH to update specific fields
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/app/v1_data?updateMask.fieldPaths=customUsers&updateMask.fieldPaths=users`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fields: {
                customUsers: { arrayValue: { values: [] } },
                users: {
                    arrayValue: {
                        values: [
                            {
                                mapValue: {
                                    fields: {
                                        id: { stringValue: '0' },
                                        username: { stringValue: 'abdr200178' },
                                        name: { stringValue: 'عبدالرحمن الصغير' },
                                        role: { stringValue: 'super_admin' },
                                        isActive: { booleanValue: true },
                                        email: { stringValue: 'abdr200178@financial.com' }
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        })
    });

    const data = await res.json();
    console.log("✅ Firestore Result:", JSON.stringify(data, null, 2));
}

run().catch(console.error);
