import { WhatsAppAuthKey } from "../../models/WhatsApp";
import { encryptString, decryptString } from "../../utils/crypto";

type BaileysModule = typeof import("@whiskeysockets/baileys", { with: { "resolution-mode": "import" } });

/**
 * Baileys auth state persisted in MongoDB (encrypted), one document per key.
 * Render/Docker disks are ephemeral, so file-based auth would force a QR rescan
 * on every restart; this lets the session reconnect automatically.
 */
export async function useMongoAuthState(businessId: string, baileys: BaileysModule) {
  const { BufferJSON, initAuthCreds, proto } = baileys;

  const read = async (key: string) => {
    const doc = await WhatsAppAuthKey.findOne({ business: businessId, key }).select("value").lean();
    if (!doc) return null;
    try {
      return JSON.parse(decryptString(doc.value), BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const write = async (key: string, data: unknown) => {
    const value = encryptString(JSON.stringify(data, BufferJSON.replacer));
    await WhatsAppAuthKey.updateOne({ business: businessId, key }, { $set: { value } }, { upsert: true });
  };

  const remove = async (key: string) => {
    await WhatsAppAuthKey.deleteOne({ business: businessId, key });
  };

  const creds = (await read("creds")) || initAuthCreds();

  const state = {
    creds,
    keys: {
      get: async (type: string, ids: string[]) => {
        const data: Record<string, any> = {};
        await Promise.all(
          ids.map(async (id) => {
            let value = await read(`${type}-${id}`);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }),
        );
        return data;
      },
      set: async (data: Record<string, Record<string, unknown>>) => {
        const tasks: Promise<unknown>[] = [];
        for (const category of Object.keys(data)) {
          for (const id of Object.keys(data[category] || {})) {
            const value = data[category][id];
            const key = `${category}-${id}`;
            tasks.push(value ? write(key, value) : remove(key));
          }
        }
        await Promise.all(tasks);
      },
    },
  };

  return {
    state,
    saveCreds: () => write("creds", state.creds),
    clear: () => WhatsAppAuthKey.deleteMany({ business: businessId }),
  };
}
