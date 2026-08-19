import { Expo } from 'expo-server-sdk';
import DeviceToken from '../models/DeviceToken.js';

const expo = new Expo();

export const sendPushNotification = async (userId, title, body, data = {}) => {
  try {
    // Find all valid push tokens for the user
    const userTokens = await DeviceToken.find({ userId, isActive: true });
    
    if (!userTokens || userTokens.length === 0) {
      console.log(`No active push tokens found for user ${userId}`);
      return false;
    }

    let messages = [];
    for (let deviceToken of userTokens) {
      const pushToken = deviceToken.token;
      
      if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`Push token ${pushToken} is not a valid Expo push token`);
        // We could deactivate it here
        continue;
      }

      messages.push({
        to: pushToken,
        sound: 'default',
        title: title,
        body: body,
        data: data,
      });
    }

    if (messages.length === 0) return false;

    // The Expo push service accepts batches of notifications so
    // that you don't need to send 1000 requests to send 1000 notifications.
    let chunks = expo.chunkPushNotifications(messages);
    let tickets = [];
    
    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log('Expo Push Tickets:', JSON.stringify(ticketChunk, null, 2));
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending push notification chunk', error);
      }
    }
    
    // Process receipt tickets (optional, to clean up invalid tokens)
    // In a real app, you would check for DeviceNotRegistered and remove the token.
    return true;
  } catch (error) {
    console.error('Failed to send push notification:', error);
    return false;
  }
};
