import Assets from '../model/assets';

export default async function getAssets() {
    try {
        const assets = await Assets.find({});
        return assets;
    } catch (err) {
        return [];
    }
}