import jwt from 'jsonwebtoken';
import { KEY } from '../config/database';
import { Request } from 'express';
import express from 'express';
import { WagerUser } from '../misc/types';
import User from '../model/user';
import Blacklist from '../model/blacklist';
import { isUserBlacklisted } from '../misc/utils';

export async function getStatus(req: Request): Promise<WagerUser | null>  {
    try {
        const token = req.cookies.access_token;

        if (!token) {
            return null;
        }

        const data: any = jwt.verify(token, KEY);
        const publicKey: string = data.publicKey;

        const user: WagerUser | null = await User.findOne({ publicKey });

        return user;
    } catch (err) {
        return null;
    }
}

export const creatorMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        const creatorUser = await getStatus(req);

        if(!creatorUser) {
            return res.status(400).json({ message: "No user data found", data: {} }) ;
        }

        const isBlacklisted = await isUserBlacklisted(creatorUser.publicKey, creatorUser.twitterData?.id);
        
        if(isBlacklisted === null) {
            return res.status(400).json({ message: "Error checking blacklist", data: {} }) ;
        }

        if(isBlacklisted) {
            return res.status(400).json({ message: "User is blacklisted", data: {} }) ;
        }

        // if user doesnt have twitter linked
        if(!creatorUser.twitterData && !creatorUser.roles.includes("ADMIN")) {
            return res.status(400).json({ message: "No Twitter account found", data: {} }) ;
        }
    
        if(creatorUser.roles.includes("CREATOR") || 
            creatorUser.roles.includes("ADMIN")) {
            req.user = creatorUser;
            return next();
        }

        return res.sendStatus(403);
    } catch {
        return res.sendStatus(403);
    }
}