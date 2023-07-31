import jwt from 'jsonwebtoken';
import { KEY } from '../config/database';
import { Request } from 'express';
import express from 'express';
import { WagerUser } from '../misc/types';

export function getStatus(req: Request): WagerUser | null  {
    try {
        const token = req.cookies.access_token;

        if (!token) {
            return null;
        }

        const data: any = jwt.verify(token, KEY);
     
        const user: WagerUser = data.user;

        return user;
    } catch (err) {
        return null;
    }
}

export const creatorMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        const creatorUser = getStatus(req);

        if(!creatorUser) {
            return res.sendStatus(403);
        }

        // if user doesnt have twitter linked
        if(!creatorUser.twitterData) {
            return res.sendStatus(403);
        }
    
        if(creatorUser.roles.includes("CREATOR") || 
            creatorUser.roles.includes("ADMIN")) {
            return next();
        }

        return res.sendStatus(403);
    } catch {
        return res.sendStatus(403);
    }
}