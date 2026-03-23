import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

// Shared Region Configuration
const REGION = "europe-west1";

/**
 * Shared logic to check user permissions
 */
async function checkPermission(context: functions.https.CallableContext, root: string, requiredPermission: string, ownerId?: string) {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "يجب تسجيل الدخول لإتمام هذه العملية."
        );
    }

    const uid = context.auth.uid;
    const userRoleDoc = await db.collection(`${root}/v1_data/user_roles`).doc(uid).get();

    if (!userRoleDoc.exists) {
        throw new functions.https.HttpsError(
            "permission-denied",
            "صلاحيات المستخدم غير موجودة في النظام (تأكد من إعداد الصلاحيات في Firestore)."
        );
    }

    const userData = userRoleDoc.data();
    const role = userData?.role;
    const permissions = userData?.permissions || [];

    // Super Admin has all permissions
    if (role === "super_admin") return userData;

    // Owner check: Allow if user is the creator
    if (ownerId && uid === ownerId) return userData;

    if (!permissions.includes(requiredPermission)) {
        throw new functions.https.HttpsError(
            "permission-denied",
            `ليس لديك الصلاحية الكافية لهذه العملية.`
        );
    }

    return userData;
}

/**
 * Helper to log activity
 */
async function addActivityLog(userId: string, userName: string, action: string, details: string, category: string, root: string = "app") {
    const logRef = db.collection(`${root}/v1_data/activity_logs`).doc();
    await logRef.set({
        id: logRef.id,
        userId,
        userName,
        action,
        details,
        category,
        timestamp: new Date().toISOString()
    });
}

// --- Dynamic Root Helper ---
function getRoot(data: any) {
    return data.env === "staging" ? "app_staging" : "app";
}

// --- Restaurant Functions ---

export const secureSaveRestaurant = functions.region(REGION).https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const root = getRoot(data);
    const userData = await checkPermission(context, root, data.id ? "restaurants_edit" : "restaurants_add");

    const { id, env, ...restaurantData } = data;
    const restaurantId = id || db.collection("unused").doc().id;

    const path = `${root}/v1_data/restaurants/${restaurantId}`;
    await db.doc(path).set({
        ...restaurantData,
        id: restaurantId,
        updatedAt: new Date().toISOString()
    }, { merge: true });

    await addActivityLog(context.auth!.uid, userData.email || "Unknown", data.id ? "تعديل مطعم" : "إضافة مطعم", `تم ${data.id ? "تحديث" : "إضافة"} المطعم: ${restaurantData.name}`, "restaurant", root);
    return { success: true, id: restaurantId };
});

export const secureDeleteRestaurant = functions.region(REGION).https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const root = getRoot(data);
    const userData = await checkPermission(context, root, "restaurants_delete");
    const { restaurantId } = data;

    const batch = db.batch();
    batch.delete(db.doc(`${root}/v1_data/restaurants/${restaurantId}`));

    // Cascading Delete
    const historySnap = await db.collection(`${root}/v1_data/history_records`).where("restaurantId", "==", restaurantId).get();
    historySnap.forEach((doc: admin.firestore.QueryDocumentSnapshot) => batch.delete(doc.ref));

    const transferSnap = await db.collection(`${root}/v1_data/transfer_requests`).where("restaurantId", "==", restaurantId).get();
    transferSnap.forEach((doc: admin.firestore.QueryDocumentSnapshot) => batch.delete(doc.ref));

    await batch.commit();
    await addActivityLog(context.auth!.uid, userData.email || "Unknown", "حذف مطعم", `حذف المطعم (${restaurantId}) وسجلاته.`, "restaurant", root);
    return { success: true };
});

// --- Employee Functions ---

export const secureSaveEmployee = functions.region(REGION).https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const root = getRoot(data);
    const userData = await checkPermission(context, root, data.id ? "users_edit" : "users_add");
    const { id, env, ...employeeData } = data;
    const employeeId = id || db.collection("unused").doc().id;

    await db.doc(`${root}/v1_data/employees/${employeeId}`).set({
        ...employeeData,
        id: employeeId,
        updatedAt: new Date().toISOString()
    }, { merge: true });

    await addActivityLog(context.auth!.uid, userData.email || "Unknown", "حفظ موظف", `حفظ بيانات الموظف: ${employeeData.name}`, "users", root);
    return { success: true, id: employeeId };
});

export const secureDeleteEmployee = functions.region(REGION).https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const root = getRoot(data);
    const userData = await checkPermission(context, root, "users_delete");
    const { id } = data;

    await db.doc(`${root}/v1_data/employees/${id}`).delete();
    await addActivityLog(context.auth!.uid, userData.email || "Unknown", "حذف موظف", `حذف الموظف ID: ${id}`, "users", root);
    return { success: true };
});

// --- History / Recon Functions ---

export const secureSaveHistoryRecord = functions.region(REGION).https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const root = getRoot(data);
    let ownerId = undefined;

    if (data.id) {
        const existing = await db.doc(`${root}/v1_data/history_records/${data.id}`).get();
        ownerId = existing.data()?.createdByUid;
    }

    const userData = await checkPermission(context, root, "recon_add", ownerId);

    const { id, env, ...recordData } = data;
    const recordId = id || db.collection("unused").doc().id;

    await db.doc(`${root}/v1_data/history_records/${recordId}`).set({
        ...recordData,
        id: recordId,
        createdByUid: recordData.createdByUid || context.auth!.uid,
        updatedAt: new Date().toISOString()
    }, { merge: true });

    return { success: true, id: recordId };
});

// --- Loan Functions ---

export const secureSaveLoanRequest = functions.region(REGION).https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const root = getRoot(data);
    const userData = await checkPermission(context, root, data.id ? "loans_view" : "loans_view"); // Need specific permissions for loans_add/edit if available
    const { id, env, ...loanData } = data;
    const loanId = id || db.collection("unused").doc().id;

    await db.doc(`${root}/v1_data/loan_requests/${loanId}`).set({
        ...loanData,
        id: loanId,
        updatedAt: new Date().toISOString()
    }, { merge: true });

    return { success: true, id: loanId };
});

export const secureApproveLoan = functions.region(REGION).https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const root = getRoot(data);
    const userData = await checkPermission(context, root, "loans_approve");
    const { loanId, approverName } = data;

    await db.doc(`${root}/v1_data/loan_requests/${loanId}`).update({
        isApproved: true,
        approvedAt: new Date().toISOString(),
        approvedByName: approverName
    });

    await addActivityLog(context.auth!.uid, userData.email || "Unknown", "اعتماد سلفة", `اعتمد ${approverName} الطلب: ${loanId}`, "general", root);
    return { success: true };
});

export const secureDeleteLoanRequest = functions.region(REGION).https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const root = getRoot(data);
    const userData = await checkPermission(context, root, "super_admin");
    const { id } = data;

    await db.doc(`${root}/v1_data/loan_requests/${id}`).delete();
    return { success: true };
});

// --- Fund Snapshot Functions ---

export const secureSaveFundSnapshot = functions.region(REGION).https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const root = getRoot(data);
    const userData = await checkPermission(context, root, data.id ? "funds_edit" : "funds_add");
    const { id, env, ...snapData } = data;
    const snapId = id || db.collection("unused").doc().id;

    await db.doc(`${root}/v1_data/fund_snapshots/${snapId}`).set({
        ...snapData,
        id: snapId,
        updatedAt: new Date().toISOString()
    }, { merge: true });

    return { success: true, id: snapId };
});

export const secureDeleteFundSnapshot = functions.region(REGION).https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const root = getRoot(data);
    const userData = await checkPermission(context, root, "super_admin");
    const { id } = data;

    await db.doc(`${root}/v1_data/fund_snapshots/${id}`).delete();
    return { success: true };
});

// --- Transfer Request Functions ---

export const secureSaveTransferRequest = functions.region(REGION).https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const root = getRoot(data);
    const userData = await checkPermission(context, root, "payments_manage");
    const { id, env, ...reqData } = data;
    const requestId = id || db.collection("unused").doc().id;

    await db.doc(`${root}/v1_data/transfer_requests/${requestId}`).set({
        ...reqData,
        id: requestId,
        updatedAt: new Date().toISOString()
    }, { merge: true });

    return { success: true, id: requestId };
});

export const secureDeleteTransferRequest = functions.region(REGION).https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const root = getRoot(data);
    const userData = await checkPermission(context, root, "payments_manage");
    const { id } = data;

    await db.doc(`${root}/v1_data/transfer_requests/${id}`).delete();
    return { success: true };
});

// --- Operational Sheet Functions ---

export const secureSaveOperationalSheet = functions.region(REGION).https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const root = getRoot(data);
    const userData = await checkPermission(context, root, "settings_manage");
    const { id, env, ...sheetData } = data;
    const sheetId = id || db.collection("unused").doc().id;

    await db.doc(`${root}/v1_data/operational_sheets/${sheetId}`).set({
        ...sheetData,
        id: sheetId
    }, { merge: true });

    return { success: true, id: sheetId };
});

export const secureDeleteOperationalSheet = functions.region(REGION).https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const root = getRoot(data);
    const userData = await checkPermission(context, root, "settings_manage");
    const { id } = data;

    await db.doc(`${root}/v1_data/operational_sheets/${id}`).delete();
    await addActivityLog(context.auth!.uid, userData.email || "Unknown", "حذف كشف عمليات", `حذف الكشف: ${id}`, "general", root);
    return { success: true };
});

export const secureDeleteUser = functions.region(REGION).https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const root = getRoot(data);
    await checkPermission(context, root, "super_admin");
    const { uidToDelete } = data;

    // 1. Delete from Firestore Roles
    await db.collection(`${root}/v1_data/user_roles`).doc(uidToDelete).delete();

    // 2. Delete from Auth (requires admin)
    await admin.auth().deleteUser(uidToDelete);

    return { success: true };
});
