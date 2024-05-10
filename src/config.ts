export class Serializer
{
    private static primitives: Set<string> = new Set<string>(["string", "number", "boolean"])

    public static serializeToJsonString(object: any): string
    {
        return JSON.stringify(object, (_: string, value: any) =>
        {
            if (value instanceof Map)
            {
                return Object.fromEntries(value)
            }

            return value
        }, 2)
    }

    public static populateFromJsonString(target: any, json: string)
    {
        const rawInput = JSON.parse(json)
        this.populateFromJsonObject(target, rawInput)
    }

    private static populateFromJsonObject(target: any, json: any)
    {
        if (json === null) return
        for (const propertyName of Object.keys(target))
        {
            const property = target[propertyName];
            const jsonKeys = new Set<string>(Object.keys(json))
            if (property instanceof Function || !jsonKeys.has(propertyName))
            {
                // not a value property or json is missing this key
                continue;
            }

            const jsonValue = json[propertyName]
            if (this.primitives.has(typeof property) && typeof property === typeof jsonValue)
            {
                target[propertyName] = jsonValue
            }
            else if (Array.isArray(property) && Array.isArray(jsonValue))
            {
                // TODO check types
                if ((jsonValue as Array<any>).some((value) => !this.primitives.has(typeof value)))
                {
                    console.log("Array of non-primitive type encountered, not assigning!")
                    console.log(`The array: ${JSON.stringify(jsonValue, null, 2)}`)
                }
                else
                {
                    target[propertyName] = jsonValue
                }

            }
            else if (property instanceof Map && jsonValue instanceof Object)
            {
                property.clear()
                // assuming types are correct
                for (const key of Object.keys(jsonValue))
                {
                    if (jsonValue[key] !== null)
                    {
                        property.set(key, jsonValue[key])
                    }
                }
            }
            else if (property instanceof Object && jsonValue instanceof Object)
            {
                this.populateFromJsonObject(property, jsonValue)
            }
            else
            {
                // we don't do anything
                console.log(`Property ${propertyName} with type ${typeof property} ignored`)
            }
        }
    }
}

export class TweakConfig
{
    verboseLogging: boolean = false;
    network: NetworkConfig = new NetworkConfig();
    noFallDamage: boolean = false;
    enableGiveCommand: boolean = false;
    priscilu: PrisciluConfig = new PrisciluConfig();
    bossSpawn: BossSpawnConfig = new BossSpawnConfig();
    botEquipments: BotEquipmentsConfig = new BotEquipmentsConfig();
    pmc: PmcConfig = new PmcConfig();
    ragfair: RagfairConfig = new RagfairConfig();
    loot: LootConfig = new LootConfig();
    trader: TraderConfig = new TraderConfig();
    raid: RaidConfig = new RaidConfig();
    quest: QuestConfig = new QuestConfig();
    item: ItemConfig = new ItemConfig();
    repair: RepairConfig = new RepairConfig();
}

export class NetworkConfig
{
    listenIp: string = "127.0.0.1";
    backendIp: string = "127.0.0.1"
}

export class PrisciluConfig
{
    filterPriscilu: boolean = false;
    filterException: string[] = [
        "591094e086f7747caa7bb2ef",
        "5910968f86f77425cf569c32"
    ];
}

export class BossSpawnConfig
{
    enable: boolean = false;
    unified: boolean = false;
    unifiedChance: number = 50;
    perBossSpawn: Map<string, BossSpawn> = new Map<string, BossSpawn>([
        // a sample
        ["bossKolontay", new BossSpawn()]
    ]);
}

export class BossSpawn
{
    unified: boolean = true;
    unifiedChance: number = 100;
}

export class BotEquipmentsConfig
{
    enable: boolean = false;
    equipmentLocks: Map<string, Map<string, string>> = new Map<string, Map<string, string>>([
        ["bossbully", new Map<string, string>([
            ["Holster", "5b3b713c5acfc4330140bd8d"]
        ])]
    ]);
    removeInventoryLimits: boolean = true;
    inventoryLimitToKeep: string[] = [
        "543be5dd4bdc2deb348b4569", // money
        "543be5cb4bdc2deb348b4568"  // ammo box
    ]
}

export class PmcConfig
{
    enable: boolean = false;
    forceHealingItemsIntoSecure: boolean = false;
    filterLootBlacklist: boolean = true;
    blacklistException: string[] = [
        "59f32bb586f774757e1e8442",
        "59f32c3b86f77472a31742f0",
        "6087e570b998180e9f76dc24",
        "614451b71e5874611e2c7ae5"
    ];
    pmcConversion: Map<string, number> = new Map<string, number>([
        ["pmcbot", 40],
        ["assault", 30]
    ]);
}

export class RagfairConfig
{
    betterRagfairSellChance: boolean = true;
    baseSellChance: number = 100;
    overpriceSellChanceCoef: number = 0.5;
    minSellChance: number = 20;
    maxSellChance: number = 100;
    cancelWaitTime: number = 5;
    accessLevel: number = 15;
}

export class LootConfig
{
    enable: boolean = false;
    useGlobalMultiplier: boolean = false;
    globalMultiplier: number = 10.0;
    perLocationMultiplier: Map<string, number> = new Map<string, number>([
        ["laboratory", 2.5],
        ["rezervbase", 2.5]
    ]);
    disableContainerRandomization: boolean = true;
    forceAllSpawnPoints: boolean = false
    _DANGER_forceSpawnAllLoosedLoot_DANEGR_: boolean = false;
}

export class TraderConfig
{
    enable: boolean = false;
    purchaseFIR: boolean = false;
    priceMultiplier: number = 1.0;
    fence: FenceConfig = new FenceConfig();
}

export class FenceConfig
{
    assortSizeMulti: number = 3.0;
    priceMulti: number = 1.0;
    regenerateOnRefresh: boolean = false;
    armorWithPlatesChance: number = 100;
    maxDurability: number = 100;
    minCurrDurability: number = 90;
    priceLimitMulti: number = 100.0;
    alwaysFullPreset: boolean = true;
    filterBlacklist: boolean = true;
    blacklistException: string[] = [
        "5d52cc5ba4b9367408500062",
        "5d52d479a4b936793d58c76b",
        "65649eb40bf0ed77b8044453",
        "5448e54d4bdc2dcc718b4568",
        "5a341c4086f77401f2541505"
    ];
}

export class RaidConfig
{
    enable: boolean = false;
    extraTime: number = 60;
    chanceExtractsAlwaysAvailable: boolean = true
}

export class QuestConfig
{
    enable: boolean = false;
    removeQuestWaitTime: boolean = true
}

export class ItemConfig
{
    enable: boolean = true;
    infiniteKeyUsage: boolean = true;
    noInventoryLimits: boolean = true;
    allGunFullauto: boolean = false;
}

export class RepairConfig
{
    enable: boolean = false;
    noRepairDamage: boolean = true;
    resetDurability: boolean = false;
}