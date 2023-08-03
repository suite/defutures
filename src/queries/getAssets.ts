import { LeaguesArray } from '../misc/types';
import Assets from '../model/assets';

export default async function getAssets(): Promise<LeaguesArray> {
    try {
        const assets = await Assets.find({});
        return assets;
    } catch (err) {
        return [];
    }
}