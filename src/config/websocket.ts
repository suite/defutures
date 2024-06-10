import { io } from '../server';
import ActivityFeed from '../model/activityFeed';
import { WagerUser } from '../misc/types';

export const setupWebSocket = () => {
  io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('disconnect', () => {
      console.log('A user disconnected');
    });
  });
};

export const broadcastAndSaveActivity = async (user: WagerUser | null, event: string, selection?: string, amount?: number) => {
    const activity = new ActivityFeed({
      user: user?._id,
      event,
      amount,
      selection,
    });
  
    await activity.save();
  
    io.emit('activityFeed', activity);
};