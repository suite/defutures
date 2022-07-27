import mongoose, { ObjectId } from "mongoose";

const { MONGO_URL } = process.env;
import Agenda, { Job } from "agenda";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import createWagerEscrows from "../queries/createWagerEscrows";
import { WagerSchema } from "../misc/types";
import findMissingEscrowTransactions from "../queries/findMissingEscrowTransactions";
import Wager from '../model/wager';
import { Logtail } from "@logtail/node";

export const IS_DEV = process.env.HEROKU ? false : true;
export const LOGTAIL = new Logtail("Mv7iTABrBnrLdVoKkZiabnyG");

export const AGENDA = new Agenda({ db: { address: MONGO_URL! } });

export const CONNECTION = new Connection(
  clusterApiUrl('devnet'),//IS_DEV ? 'http://localhost:8899' : clusterApiUrl('devnet'), 
  'confirmed'
);

const FUND_WALLET = process.env.FUND_WALLET as string;
const FUND_SEED = new Uint8Array(FUND_WALLET.split(",").map((e: string) => parseInt(e))).slice(0,32);
export const FUND_KEYPAIR = Keypair.fromSeed(FUND_SEED);

export const PAYOUT_PRECISION = 100;
export const FEE_MULTIPLIER = 0.98; // 2% off each bet

export const ALGORITHM = "aes-192-cbc";
export const SALT = process.env.SALT as string;
export const KEY = process.env.KEY as string;

// Dust mint: DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ
export const TOKEN_MINT = new PublicKey(process.env.TOKEN_MINT as string)

export const connectMongo = async () => {
  // Connecting to the database
  try {
    await mongoose.connect(MONGO_URL!)
    
    // Start
    await AGENDA.start();

    // Checks for live games and searches for missing txs
    await AGENDA.every("15 minutes", "check transactions");

  } catch (err) {
    console.log("database connection failed. exiting now...");
    console.error(err);
    process.exit(1);
  }
};

// pretty sure agenda handles errors
AGENDA.define("update status", async (job: Job) => {
  const { status, wagerId, wager } = job.attrs.data as {
    status: string,
    wagerId: ObjectId,
    wager: WagerSchema
  };

  LOGTAIL.info(`Updating pick status ${wagerId} to ${status}`)

  if(status === 'live') {
      const status = await createWagerEscrows(wager);
      if(!status) return;
  }

  // Final check for missing txs before closing 
  if(status === 'closed') {
      const updatedWager: WagerSchema | null = await Wager.findById(wager._id);

      if(updatedWager) {
        for(const selection of updatedWager.selections) {
          if(selection.publicKey) {
              await findMissingEscrowTransactions(new PublicKey(selection.publicKey))
          }
        }
      }
  }

  await Wager.updateOne({ _id: wagerId }, { status })
})

AGENDA.define("check transactions", async (job: Job) => {
  const liveWagers: Array<WagerSchema> | null = await Wager.find({ status: 'live' });

  console.log("running check transactions")
  console.log("live wagers", liveWagers.length)

  LOGTAIL.info(`Running check transactions on ${liveWagers.length} live wagers.`)

  for(const wager of liveWagers) {
      for(const selection of wager.selections) {
          if(selection.publicKey) {
              await findMissingEscrowTransactions(new PublicKey(selection.publicKey))
          }
      }
  }
})