import mongoose, { ObjectId } from "mongoose";

const { MONGO_URL } = process.env;
import Agenda, { Job } from "agenda";
import { Connection, Keypair, PublicKey, clusterApiUrl, Cluster } from "@solana/web3.js";
import createWagerEscrows from "../queries/createWagerEscrows";
import { WagerSchema } from "../misc/types";
import findMissingEscrowTransactions from "../queries/findMissingEscrowTransactions";
import Wager from '../model/wager';
import Pick from '../model/pick'
import { Logtail } from "@logtail/node";

// TODO: Better is dev check, move logtail to env, new for dev
export const IS_DEV = process.env.HEROKU ? false : true;
export const LOGTAIL = new Logtail("Mv7iTABrBnrLdVoKkZiabnyG");

export const AGENDA = new Agenda({ db: { address: MONGO_URL! } });

const CLUSTER = process.env.CLUSTER as Cluster || 'devnet';
const CLUSTER_URL = process.env.CLUSTER_URL as string;

export const CONNECTION = new Connection(
  CLUSTER_URL ? CLUSTER_URL : clusterApiUrl(CLUSTER),
  'confirmed'
);

const FUND_WALLET = process.env.FUND_WALLET as string;
const FUND_SEED = new Uint8Array(FUND_WALLET.split(",").map((e: string) => parseInt(e))).slice(0,32);
export const FUND_KEYPAIR = Keypair.fromSeed(FUND_SEED);

export const PAYOUT_PRECISION = 100;
export const FEE_MULTIPLIER = 0.9667; // 3.33% off each bet

export const ALGORITHM = "aes-192-cbc";
export const SALT = process.env.SALT as string;
export const KEY = process.env.KEY as string;

// Change token type based  off cluster/clusterurl
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

AGENDA.define("update pick", async (job: Job) => {
  const { status, pickId } = job.attrs.data as {
    status: string,
    pickId: ObjectId,
  };

  LOGTAIL.info(`Updating pick status ${pickId} to ${status}`)

  // TODO: Build out for picks
  // Final check for missing txs before closing 
  // if(status === 'closed') {
  //     const updatedWager: WagerSchema | null = await Wager.findById(wager._id);

  //     if(updatedWager) {
  //       for(const selection of updatedWager.selections) {
  //         if(selection.publicKey) {
  //             await findMissingEscrowTransactions(new PublicKey(selection.publicKey))
  //         }
  //       }
  //     }
  // }

  await Pick.findByIdAndUpdate(pickId, { status })
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