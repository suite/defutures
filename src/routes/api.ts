import bs58 from "bs58";
import express from "express";
import nacl from "tweetnacl";
import { confirmWalletSigned, getObjectId, isValidPubKey, isWhitelisted } from "../misc/utils";
import Wager from "../model/wager";
import Pick from "../model/pick";
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import placeBet from "../queries/placeBet";
import { KEY, WALLET_SIGN_MESSAGE_LOGIN, WALLET_SIGN_MESSAGE_LOGOUT } from "../config/database";
import { ServerError } from "../misc/serverError";
import getUserWager from "../queries/getUserWager";
import { PickSchema, WagerSchema, WagerUser } from "../misc/types";
import getUserPick from "../queries/getUserPick";
import placePick from "../queries/placePick";
import { getPickemLeaderboard } from "../queries/leaderboard";
import Stats from "../model/stats";
import { getActivity } from "../queries/activity";
import getAssets from "../queries/getAssets";
import User from "../model/user";
import { creatorMiddleware, getStatus } from "../queries/getStatus";
import createWager from "../queries/createWager";
import declareWagerWinner from "../queries/declareWagerWinner";

const router = express.Router();

// generate nonce
// login
// wagers (select values to be shown)
// place bet

const nonces: { [key: string]: string } = {};

router.post('/generateNonce', async (req, res) => {
    const { publicKey } = req.body;

    if(!publicKey) {
        res.status(400).json({ nonce: ""})
        return;
    }

    let nonce = nonces[publicKey];
    if(!nonce) {
        nonce = crypto.randomBytes(16).toString('hex');
    
        nonces[publicKey] = nonce;
    }

    res.status(200).json({ nonce })
})

// TODO: Rename
router.post('/login', async (req, res) => {
    const { publicKey, signedMessage } = req.body;

    if(!signedMessage) {
        res.status(400).json({ verified: false })
        return;
    }

    try {
        const verified = confirmWalletSigned(nonces[publicKey], signedMessage, publicKey);

        delete nonces[publicKey];

        if(!verified) {
            res.status(400).json({ success: false })
            return;
        }

        let user: WagerUser | null = await User.findOne({ publicKey });

        if(!user) {
            user = await User.create({ publicKey });
        }

        const token = jwt.sign({ publicKey }, KEY, { "expiresIn": "7d" });

        res.cookie("access_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days in milliseconds
        }).status(200).json({ success: true, user });

    } catch (err) {
        res.status(400).json({ success: false })
    }
});

router.post('/logout', async (req, res) => {
    res.clearCookie("access_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? 'none' : 'lax'
    }).status(200).json({ success: true });
});

router.get('/status', async (req, res) => {
    const user = await getStatus(req);

    if(user === null) {
        res.status(403).json({ success: false });
        return;
    }

    res.status(200).json({ success: true, user });
});

// DEPRECATED USE FOR TWITTER LOGIN
router.post('/confirmWallet', async (req, res) => {
    const { publicKey, signedMessage, isLogin } = req.body;

    try {
        const messageToSign = (isLogin === "true") ? WALLET_SIGN_MESSAGE_LOGIN : WALLET_SIGN_MESSAGE_LOGOUT;
        const verified = confirmWalletSigned(messageToSign, signedMessage, publicKey);

        if(!verified) {
            res.status(400).json({ verified: false })
            return;
        }

        const token = jwt.sign({ publicKey }, KEY, { "expiresIn": "2h" });

        res.cookie("wallet_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? 'none' : 'lax'
        }).status(200).json({ verified });

    } catch (err) {
        res.status(400).json({ verified: false });
    }

});

router.get('/wagers', async (req, res) => {
    try {
        const wagers: Array<WagerSchema> = await Wager.find({}, { 
            title: 1,
            description: 1,
            finalScore: 1,
            status: 1,
            league: 1,
            selections: 1,
            startDate: 1,
            endDate: 1,
            gameDate: 1,
            _id: 1,
            metadata: 1,
            creator: 1
         })

        wagers.filter(wager => wager.status !== 'live')
                                    .map(wager => wager.selections.map(sel => sel.publicKey = ''))
        
        res.status(200).json(wagers)
    } catch (err) {
        return res.sendStatus(500);
    }   
})

router.get('/picks', async (req, res) => {
    try {
        const picks: Array<PickSchema> = await Pick.find({}, { 
            title: 1,
            description: 1,
            publicKey: 1,
            entryFee: 1,
            totalUsers: 1,
            totalSpent: 1,
            status: 1,
            selections: 1,
            startDate: 1,
            endDate: 1,
            _id: 1
         })

        picks.filter(pick => pick.status !== 'live')
                                    .map(pick => pick.publicKey = '');
        
        res.status(200).json(picks);
    } catch (err) {
        return res.sendStatus(500);
    }   
})

router.post('/placeBet', async (req, res) => {
    const { wagerId, selectionId, signature } = req.body;

    const wagerObjectId = getObjectId(wagerId);
    const selectionObjectId = getObjectId(selectionId);

    if (!(wagerObjectId && selectionObjectId && signature)) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;
    }

    const result = await placeBet(wagerObjectId, selectionObjectId, signature);

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Placed bet", data: result })
})

router.post('/placePick', async (req, res) => {
    const { pickId, pickedTeams, tieBreaker, signature } = req.body;

    const pickObjectId = getObjectId(pickId);

    if (!(pickObjectId && pickedTeams && tieBreaker && signature)) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;
    }

    const result = await placePick(pickId, pickedTeams, tieBreaker, signature);

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Placed pick", data: result })
})

router.post('/getUserWager', async (req, res) => {
    const { wagerId, publicKey } = req.body;

    const wagerObjectId = getObjectId(wagerId);

    if (!(wagerObjectId && isValidPubKey(publicKey))) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;
    }

    const result = await getUserWager(wagerObjectId, publicKey);

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Fetched user wager", data: result })
})

router.post('/getUserPick', async (req, res) => {
    const { pickId, publicKey } = req.body;

    const pickObjectId = getObjectId(pickId);

    if (!(pickObjectId && isValidPubKey(publicKey))) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;
    }

    const result = await getUserPick(pickObjectId, publicKey);

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Fetched user pick", data: result })
})

router.get('/leaderboard', async (req, res) => {
    const { pickId } = req.query;

    const pickObjectId = (pickId) ? getObjectId(pickId as string) : null;

    const result = await getPickemLeaderboard(pickObjectId);

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Fetched leaderboard", data: result })
})

router.get('/stats', async (req, res) => {
    try {
        const stats = await Stats.findOne({});

        res.status(200).json({ message: "Fetched stats", data: stats });
    } catch(err) {
        return res.status(400).json({ message: "Error fetching stats", data: {} }) 
    }
})

router.post('/activityFeed', async (req, res) => {
    try {
        const { wagerId } = req.body;

        const wagerObjectId = getObjectId(wagerId);

        if (!wagerObjectId) {
            res.status(400).send({ message: "Invalid input", data: {} });
            return;
        }

        const activity = await getActivity(wagerObjectId);
        res.status(200).json({ message: "Fetched activity", data: activity })
    } catch(err) {
        return res.status(400).json({ message: "Error fetching stats", data: {} }) 
    } 
})

router.get('/assets', async (req, res) => {
    const assets = await getAssets();
    res.status(200).json({ message: "Fetched assets", data: assets });
});

router.post('/createWager', creatorMiddleware, async (req, res) => {
    const creatorUser = await getStatus(req);

    if (!creatorUser) {
        res.status(400).send({ message: "No user data found", data: {} });
        return;
    }

    const { title,
        description,
        league,
        collectionName,
        selection1,
        selection1Record, 
        selection2, 
        selection2Record,
        gameDate, token } = req.body;

    const startDate = new Date().getTime() + 1000 * 60;
    const endDate = gameDate;

    if (!(title && description && selection1 && selection2 && 
         startDate && endDate && gameDate && token && collectionName))
        {
            res.status(400).send({ message: "Invalid input", data: {} });
            return;
    }

    const result = await createWager(title,
        description,
        league, 
        collectionName,
        selection1,
        selection1Record, 
        selection2,
        selection2Record, 
        startDate, 
        endDate, 
        gameDate,
        creatorUser,
        token);

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Created wager", data: result })    
});

router.post('/declareWinner', creatorMiddleware, async (req, res) => {
    const creatorUser = await getStatus(req);

    if (!creatorUser) {
        res.status(400).send({ message: "No user data found", data: {} });
        return;
    }

    const { wagerId, selectionId, finalScore } = req.body;

    const selectionObjectId = getObjectId(selectionId);
    const wagerObjectId = getObjectId(wagerId);

    if(!selectionObjectId || !wagerObjectId) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;
    }

    const result = await declareWagerWinner(creatorUser, wagerObjectId, selectionObjectId, finalScore)

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Declared winner", data: result })
})

export default router;