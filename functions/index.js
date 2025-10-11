/* eslint-env node */

/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onDocumentCreated, onDocumentDeleted} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

const firestore = admin.firestore();

const MAX_MESSAGE_PREVIEW_LENGTH = 180;

const createMessagePreview = (body) => {
  if (typeof body !== "string") {
    return "";
  }

  const trimmed = body.trim();
  if (trimmed.length <= MAX_MESSAGE_PREVIEW_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_MESSAGE_PREVIEW_LENGTH - 1)}…`;
};

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({
  region: "australia-southeast1",
  maxInstances: 10,
});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

exports.onMessageCreated = onDocumentCreated("messages/{messageId}", async (event) => {
  const snapshot = event.data;

  if (!snapshot) {
    logger.warn("Message creation event received without data.");
    return;
  }

  const messageData = snapshot.data();

  if (!messageData) {
    logger.warn("Message document contained no data.");
    return;
  }

  const recipientId = messageData.recipientId;

  if (!recipientId) {
    logger.warn("Message was created without a recipientId.", {
      messageId: event.params.messageId,
    });
    return;
  }

  const notificationPayload = {
    recipientId,
    messageId: event.params.messageId,
    type: "message",
    read: false,
    senderId: messageData.senderId ?? null,
    senderName: messageData.senderName ?? null,
    messageBody: typeof messageData.body === "string" ? messageData.body : "",
    messagePreview: createMessagePreview(messageData.body),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    await firestore.collection("notifications").add(notificationPayload);
    logger.info("Notification created for message.", {
      messageId: event.params.messageId,
      recipientId,
    });
  } catch (error) {
    logger.error("Failed to create notification for message.", error);
  }
});

exports.onUserDeleted = onDocumentDeleted("users/{userId}", async (event) => {
  const userId = event.params.userId;

  if (!userId) {
    logger.warn("User deletion event received without a userId.");
    return;
  }

  try {
    await admin.auth().deleteUser(userId);
    logger.info("Deleted Firebase Authentication user for Firestore document.", {
      userId,
    });
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      logger.info("No Firebase Authentication user found for deleted Firestore user.", {
        userId,
      });
      return;
    }

    logger.error("Failed to delete Firebase Authentication user.", error);
  }
}); 
