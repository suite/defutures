import mongoose, { ObjectId } from "mongoose";

const { MONGO_URL } = process.env;
import Agenda, { Job } from "agenda";
import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";
import createWagerEscrows from "../queries/createWagerEscrows";
import { WagerSchema } from "../misc/types";
import findMissingEscrowTransactions from "../queries/findMissingEscrowTransactions";
import Wager from '../model/wager';

export const AGENDA = new Agenda({ db: { address: MONGO_URL! } });

export const CONNECTION = new Connection(
  clusterApiUrl('devnet'),
  // 'http://localhost:8899', // web3.clusterApiUrl('mainnet-beta'), //devnet
  'confirmed'
);

const FUND_WALLET = process.env.FUND_WALLET as string;
const FUND_SEED = new Uint8Array(FUND_WALLET.split(",").map((e: string) => parseInt(e))).slice(0,32);
export const FUND_KEYPAIR = Keypair.fromSeed(FUND_SEED);

export const PAYOUT_PRECISION = 100;
export const FEE_MULTIPLIER = 0.995; // 0.5% off each bet

export const ALGORITHM = "aes-192-cbc";
export const SALT = process.env.SALT as string;
export const KEY = process.env.KEY as string;

// const TOKEN_MINT = new web3.PublicKey("DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ");
// export const TOKEN_MINT = new PublicKey("ELEJMZQ585rAegqfGnu5NfXXZA9hu8SHadw4cpK1QEjy"); localnet
export const TOKEN_MINT = new PublicKey("AkDWDJ37DqhLN95TL467NFAPixDTq1L6iXLJ1Boqznr1");

export const connectMongo = async () => {
  // Connecting to the database
  try {
    await mongoose.connect(MONGO_URL!)
    
    // Start
    await AGENDA.start();

    // Checks for live games and searches for missing txs
    await AGENDA.every("5 minutes", "check transactions");

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

  for(const wager of liveWagers) {
      for(const selection of wager.selections) {
          if(selection.publicKey) {
              await findMissingEscrowTransactions(new PublicKey(selection.publicKey))
          }
      }
  }
})