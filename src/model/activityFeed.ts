import mongoose, { Schema } from 'mongoose';

const activityFeedSchema = new mongoose.Schema({
  user: { type: Schema.Types.ObjectId, ref: 'user' },
  event: { type: String },
  amount: { type: Number },
  selection: { type: String },
  timestamp: { type: Date, default: Date.now },
  signature: { type: String }
});

export default mongoose.model('ActivityFeed', activityFeedSchema);