import { Expo } from 'expo-server-sdk';

const expo = new Expo();

async function checkReceipts() {
  const receiptIds = [
    '019ff9e1-5114-7038-81a8-6777ea1cc151',
    '019ff9e1-c622-71ff-9860-2715bb7b4a5c'
  ];

  try {
    let receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
    for (let chunk of receiptIdChunks) {
      let receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      console.log('Receipts:', JSON.stringify(receipts, null, 2));
    }
  } catch (error) {
    console.error(error);
  }
}

checkReceipts();
