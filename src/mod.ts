import { DependencyContainer } from "tsyringe";

// SPT types
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { IPreAkiLoadMod } from "@spt-aki/models/external/IPreAkiLoadMod";
import { IDatabaseTables } from "@spt-aki/models/spt/server/IDatabaseTables";
import { ILocationData } from "@spt-aki/models/spt/server/ILocations";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";


import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IPmcConfig } from "@spt-aki/models/spt/config/IPmcConfig";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { RagfairSellHelper } from "@spt-aki/helpers/RagfairSellHelper";
import { IRagfairConfig } from "@spt-aki/models/spt/config/IRagfairConfig";
import { ILocationConfig } from "@spt-aki/models/spt/config/ILocationConfig";
import { IInsuranceConfig } from "@spt-aki/models/spt/config/IInsuranceConfig";

import * as config from "../config/config.json";
import { FenceConfig, ITraderConfig } from "@spt-aki/models/spt/config/ITraderConfig";
import { MinMax } from "@spt-aki/models/common/MinMax";

const prisciluId = "Priscilu";

class SkyTweaks implements IPreAkiLoadMod, IPostDBLoadMod
{
    mod: string
    logger: ILogger
    names: Map<string, string>

    private container: DependencyContainer

    constructor()
    {
        this.mod = "SkyTweaks"; // Set name of mod, so we can log it to console later
        this.names = new Map<string, string>()
    }

    public preAkiLoad(container: DependencyContainer): void
    {
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.logger.info(`[${this.mod}] preAki Loading... `)
        this.container = container

        if (config.ragfair.betterRagfairSellChance) 
        {
            // Override aki's ragfair offer sell chance calculation
            container.afterResolution("RagfairSellHelper", (_t, result: RagfairSellHelper) =>
            {
                result.calculateSellChance = (averageOfferPriceRub: number, playerListedPriceRub: number, qualityMultiplier: number) => 
                {
                    const chances = container.resolve<ConfigServer>("ConfigServer").getConfig<IRagfairConfig>(ConfigTypes.RAGFAIR).sell.chance
                    const base = chances.base * qualityMultiplier;
                    const result = base * Math.min(1, Math.pow(config.ragfair.overpriceSellChanceCoef, playerListedPriceRub / averageOfferPriceRub - 1))
                    const rounded = Math.max(chances.minSellChancePercent, Math.min(chances.maxSellChancePercent, Math.round(result)))
                    this.logger.info(`[${this.mod}] ragfair offer ${playerListedPriceRub} (avg ${averageOfferPriceRub}), ${rounded}%`);
                    return rounded
                }
            });
        }
        
        this.logger.info(`[${this.mod}] preAki Loaded`);
    }

    public postDBLoad(container: DependencyContainer): void
    {
        this.logger.debug(`[${this.mod}] postDb Loading... `);

        const databaseServer: DatabaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const configServer = container.resolve<ConfigServer>("ConfigServer")

        const tables = databaseServer.getTables();
        const pmcConfig = configServer.getConfig<IPmcConfig>(ConfigTypes.PMC)
        const ragfairConfig = configServer.getConfig<IRagfairConfig>(ConfigTypes.RAGFAIR)
        const locationConfig = configServer.getConfig<ILocationConfig>(ConfigTypes.LOCATION)
        const traderConfig = configServer.getConfig<ITraderConfig>(ConfigTypes.TRADER)

        this.loadItemNames(tables)
        this.tweakItems(tables)
        this.noArmorRepairDamage(tables)
        this.tweakInsurance(tables, configServer)

        this.lockBotEquipment(tables)
        this.tweakPmcConversion(pmcConfig)
        this.allowThingsInHolster(tables)


        if (config.Priscilu.filterPriscilu)
        {
            this.filterPriscilu(tables)
        }

        if (config.bossSpawn.enabled)
        {
            this.changeBossSpawnRate(tables)
        }

        if (config.ragfair.betterRagfairSellChance)
        {
            this.updateRagfairSellChance(ragfairConfig)
        }

        if (config.loot.enable)
        {
            this.lootMultiplier(locationConfig)
        }

        if (config.trader.enable)
        {
            this.tweakTraders(traderConfig)
        }

        // this.logger.info(`[${this.mod}] Misc`)

        this.logger.debug(`[${this.mod}] postDb Loaded`);
    }

    private loadItemNames(tables: IDatabaseTables) 
    {
        this.names.clear()
        const locals = tables.locales.global["en"]
        const dbItems = tables.templates.items
        for (const dbItemsKey in dbItems) 
        {
            const item = dbItems[dbItemsKey]
            if (`${item._id} Name` in locals) 
            {
                this.names[item._id] = locals[`${item._id} Name`]
            } 
            else 
            {
                this.names[item._id] = item._name
            }
            if (config.verboseLogging) this.logger.debug(`[${this.mod}] ${item._id}:${this.names[item._id]}`)
        }
        this.logger.info(`[${this.mod}] item names Loaded`)
    }

    private tweakItems(tables: IDatabaseTables)
    {
        this.logger.info(`[${this.mod}] Tweaking individual items`)
        const dbItems = tables.templates.items
        for (const id in dbItems)
        {
            const item = dbItems[id]
            if ((item._parent == "5c99f98d86f7745c314214b3" || item._parent == "5c164d2286f774194c5e69fa") && item._props.MaximumNumberOfUsage !== undefined)
            {
                item._props.MaximumNumberOfUsage = 0
                if (config.verboseLogging) this.logger.debug("[no usage limit] " + this.names[id])
            }
            else if (item._props.MaxRepairDegradation !== undefined && item._props.MaxRepairKitDegradation !== undefined)
            {
                item._props.MinRepairDegradation = 0;
                item._props.MaxRepairDegradation = 0;
                item._props.MinRepairKitDegradation = 0;
                item._props.MaxRepairKitDegradation = 0;
                if (config.verboseLogging) this.logger.debug("[no repair damage] " + this.names[id])
            }
        }

        dbItems["590c657e86f77412b013051d"]._props.MaxHpResource = 36000;
        dbItems["590c657e86f77412b013051d"]._props.hpResourceRate = 700;
        //"5811ce772459770e9e5f9532:Grids:0:_props:cellsV:148",
        dbItems["5811ce772459770e9e5f9532"]._props.Grids[0]._props.cellsV = 148
    }

    private noArmorRepairDamage(tables: IDatabaseTables)
    {
        this.logger.info(`[${this.mod}] Removing armor repair damage`)
        const armorMats = tables.globals.config.ArmorMaterials
        for (const mat in armorMats)
        {
            armorMats[mat].MaxRepairDegradation = 0
            armorMats[mat].MinRepairDegradation = 0
            armorMats[mat].MaxRepairKitDegradation = 0
            armorMats[mat].MinRepairKitDegradation = 0
        }
    }

    private tweakInsurance(tables: IDatabaseTables, configServer: ConfigServer)
    {
        this.logger.info(`[${this.mod}] Buffing insurance`)
        const globals = tables.globals.config;
        const insuranceConfig = configServer.getConfig<IInsuranceConfig>(ConfigTypes.INSURANCE)
        const traders = tables.traders

        insuranceConfig.insuranceMultiplier["54cb50c76803fa8b248b4571"] = 0.01;
        insuranceConfig.insuranceMultiplier["54cb57776803fa99248b456e"] = 0.01;
        insuranceConfig.returnChancePercent["54cb50c76803fa8b248b4571"] = 100;
        insuranceConfig.returnChancePercent["54cb57776803fa99248b456e"] = 100;
        globals.Insurance.MaxStorageTimeInHour = 720;
        traders["54cb50c76803fa8b248b4571"].base.insurance.min_return_hour = 0;
        traders["54cb50c76803fa8b248b4571"].base.insurance.max_return_hour = 1;
        traders["54cb57776803fa99248b456e"].base.insurance.min_return_hour = 0;
        traders["54cb57776803fa99248b456e"].base.insurance.max_return_hour = 1;
    }

    private filterPriscilu(tables: IDatabaseTables) 
    {
        this.logger.info(`[${this.mod}] Filtering Priscilu's Items`)
        if (!(prisciluId in tables.traders)) 
        {
            this.logger.warning(`[${this.mod}] Priscilu not installed, skipped.`)
            return
        }
        const priscilu = tables.traders[prisciluId]
        const dbItems = tables.templates.items
        const exceptions = new Set<string>(config.Priscilu.filterException)

        let removed = 0
        priscilu.assort.items = priscilu.assort.items.filter((item) => 
        {
            const dbItem = dbItems[item._tpl]
            if (exceptions.has(item._tpl) || dbItem._props.CanSellOnRagfair === false) 
            {
                return true;
            }
            removed++
            return false
        });
        this.logger.success(`[${this.mod}] Priscilu's Items removed: ${removed}`)
    }

    private changeBossSpawnRate(tables: IDatabaseTables) 
    {
        this.logger.info(`[${this.mod}] Modifying boss spawn rate`)

        const locations = tables.locations;
        const bossSpawn = config.bossSpawn

        if (bossSpawn.unified && !isNaN(bossSpawn.unifiedChance))
        {
            this.logger.info(`[${this.mod}] Boss spawn rate is UNIFIED!`)
            for (const i in locations) 
            {
                const location: ILocationData = locations[i];
                if (i === "base") 
                {
                    continue
                }
                location.base.BossLocationSpawn.forEach((spawn) =>
                {
                    spawn.BossChance = bossSpawn.unifiedChance
                    this.logger.success(`[${this.mod}] ${spawn.BossName}@${location.base.Name} (${i}) spawn chance: ${spawn.BossChance}%`);
                })
            }
            return
        }

        this.logger.info(`[${this.mod}] Boss spawn rate is per boss.`)

        const perBoss = bossSpawn.perBossSpawn
        for (const bName in perBoss)
        {
            const unified = perBoss[bName]["unified"] === true
            if (unified)
            {
                const chance = perBoss[bName]["unifiedChance"]
                if (!isNaN(chance))
                {
                    for (const i in locations)
                    {
                        const location: ILocationData = locations[i];
                        if (i === "base")
                        {
                            continue
                        }
                        location.base.BossLocationSpawn.forEach((spawn) =>
                        {
                            if (spawn.BossName.toLowerCase() === bName.toLowerCase())
                            {
                                spawn.BossChance = chance
                                this.logger.success(`[${this.mod}] ${spawn.BossName}@${location.base.Name} (${i}) spawn chance: ${spawn.BossChance}%`);
                            }
                        })
                    }
                }
            }
            //TODO non-unified boss spawn chance
        }
    }

    private lockBotEquipment(tables: IDatabaseTables)
    {
        this.logger.info(`[${this.mod}] Locking Bots' Equipments`)
        const bots = tables.bots.types
        const botsEquip = config.botsEquip

        for (const botName in botsEquip)
        {
            for (const equipLocation in botsEquip[botName])
            {
                const itemId = botsEquip[botName][equipLocation]
                this.logger.debug(`[${this.mod}] ${botName}:${equipLocation}:${itemId}`)
                if (itemId in tables.templates.items)
                {
                    const bot = bots[botName]
                    const equipment: Record<string, number> = bot.inventory.equipment[equipLocation]
                    for (const equipmentKey in equipment)
                    {
                        equipment[equipmentKey] = 0
                    }
                    equipment[itemId] = 100
                    bot.chances.equipment[equipLocation] = 100
                    this.logger.success(`[${this.mod}] ${botName}'s ${equipLocation} locked as <${this.names[itemId]}>`)
                }
                else
                {
                    this.logger.warning(`[${this.mod}] item ${itemId} not found!`)
                }
            }
            // TODO: lock equipment mods
        }

    }

    private tweakPmcConversion(pmcConfig: IPmcConfig)
    {
        this.logger.info(`[${this.mod}] Changing PMC conversion rate`)
        const conv = config.pmcConversion

        for (const botName in conv)
        {
            const rate = conv[botName]
            if (isNaN(rate))
            {
                this.logger.error(`[${this.mod}] PMC from ${botName} conversion rate is not a number: ${rate}`)
            }
            else
            {
                pmcConfig.convertIntoPmcChance[botName].min = rate
                pmcConfig.convertIntoPmcChance[botName].max = rate
                this.logger.success(`[${this.mod}] PMC from ${botName} conversion rate: ${rate}%`)
            }
        }
    }

    private allowThingsInHolster(tables: IDatabaseTables)
    {
        this.logger.info(`[${this.mod}] Allowing things in holster`)
        const dbItems = tables.templates.items
        dbItems["55d7217a4bdc2d86028b456d"]._props.Slots[2]._props.filters[0].Filter.push("5447bedf4bdc2d87278b4568"); // grenade launcher
        dbItems["55d7217a4bdc2d86028b456d"]._props.Slots[2]._props.filters[0].Filter.push("5447b5e04bdc2d62278b4567"); // smg
    }

    private updateRagfairSellChance(ragfairConfig: IRagfairConfig)
    {
        ragfairConfig.sell.chance.base = config.ragfair.baseSellChance
        ragfairConfig.sell.chance.minSellChancePercent = config.ragfair.minSellChance
        ragfairConfig.sell.chance.maxSellChancePercent = config.ragfair.maxSellChance
        ragfairConfig.sell.expireSeconds = config.ragfair.cancelWaitTime
        this.logger.success(`[${this.mod}] Ragfair sell chance: ${ragfairConfig.sell.chance.base}% [${ragfairConfig.sell.chance.minSellChancePercent}%, ${ragfairConfig.sell.chance.maxSellChancePercent}%] `)
    }

    private lootMultiplier(locationConfig: ILocationConfig)
    {
        this.logger.info(`[${this.mod}] Multiplying loot`)
        if (config.loot.useGlobal)
        {
            const globalMulti = config.loot.globalMultiplier
            for (const location in locationConfig.looseLootMultiplier)
            {
                locationConfig.looseLootMultiplier[location] *= globalMulti
                locationConfig.staticLootMultiplier[location] *= globalMulti
                this.logger.success(`[${this.mod}] ${location} loot multiplier: ${locationConfig.looseLootMultiplier[location]}, ${locationConfig.staticLootMultiplier[location]}`)
            }
            return
        }
        for (const location in config.loot.locations)
        {
            const multi = config.loot.locations[location]
            locationConfig.looseLootMultiplier[location] *= multi
            locationConfig.staticLootMultiplier[location] *= multi
            this.logger.success(`[${this.mod}] ${location} loot multiplier: ${locationConfig.looseLootMultiplier[location]}, ${locationConfig.staticLootMultiplier[location]}`)
        }
        
    }

    private tweakTraders(traderConfig: ITraderConfig)
    {
        this.logger.info(`[${this.mod}] Tweaking traders`)
        const trader = config.trader
        traderConfig.purchasesAreFoundInRaid = trader.purchaseFIR
        traderConfig.traderPriceMultipler *= trader.priceMulti
        this.logger.success(`[${this.mod}] trader price multi: ${traderConfig.traderPriceMultipler}`)

        this.tweakFence(traderConfig.fence)
    }

    private tweakFence(fence: FenceConfig)
    {
        this.logger.info(`[${this.mod}] Tweaking fence`)
        const conf = config.trader.fence

        //assort size
        const sizeMulti = conf.assortSizeMulti
        this.logger.info(`[${this.mod}] multiplying fence listing by ${sizeMulti}`)
        fence.weaponPresetMinMax = this.scaleMinMax(fence.weaponPresetMinMax, sizeMulti, true)
        this.logger.success(`[${this.mod}] guns: [${fence.weaponPresetMinMax.min}, ${fence.weaponPresetMinMax.max}]`)
        fence.equipmentPresetMinMax = this.scaleMinMax(fence.equipmentPresetMinMax, sizeMulti, true)
        this.logger.success(`[${this.mod}] equips: [${fence.equipmentPresetMinMax.min}, ${fence.equipmentPresetMinMax.max}]`)
        let total = 0;
        for (const type in fence.itemTypeLimits)
        {
            fence.itemTypeLimits[type] = Math.round(Math.max(1, fence.itemTypeLimits[type]) * sizeMulti)
            total += fence.itemTypeLimits[type]
            this.logger.success(`[${this.mod}] ${this.names[type]}: ${fence.itemTypeLimits[type]}`)
        }
        total += fence.weaponPresetMinMax.max
        total += fence.equipmentPresetMinMax.max
        fence.assortSize = Math.ceil(Math.max(total, Math.round(fence.assortSize * sizeMulti)) / 100) * 100
        this.logger.success(`[${this.mod}] fence total listing size: ${fence.assortSize}`)

        fence.itemPriceMult *= conf.priceMulti
        fence.presetPriceMult *= conf.priceMulti
        this.logger.success(`[${this.mod}] price multi: ${fence.itemPriceMult}, ${fence.presetPriceMult}`)

        fence.regenerateAssortsOnRefresh = conf.regenerateOnRefresh
        fence.chancePlateExistsInArmorPercent = conf.armorWithPlatesChance

        fence.armorMaxDurabilityPercentMinMax = { min: conf.durability.min, max: conf.durability.max }
        this.logger.success(`[${this.mod}] armor dura: [${fence.armorMaxDurabilityPercentMinMax.min}, ${fence.armorMaxDurabilityPercentMinMax.max}]`)
        fence.presetMaxDurabilityPercentMinMax = { min: conf.durability.min, max: conf.durability.max }
        this.logger.success(`[${this.mod}] preset dura: [${fence.presetMaxDurabilityPercentMinMax.min}, ${fence.presetMaxDurabilityPercentMinMax.max}]`)

        for (const type in fence.itemCategoryRoublePriceLimit)
        {
            fence.itemCategoryRoublePriceLimit[type] = Math.round(fence.itemCategoryRoublePriceLimit[type] * conf.priceLimitMulti)
            this.logger.success(`[${this.mod}] price limit ${fence.itemCategoryRoublePriceLimit[type]} for ${this.names[type]}`)
        }


        if (conf.filterBlacklist)
        {
            const bc: string[] = []
            const exceptions = new Set(conf.blacklistException)
            fence.blacklist.forEach((type) =>
            {
                if (exceptions.has(type))
                {
                    bc.push(type)
                    this.logger.info(`[${this.mod}] kept in blacklist: ${type} <${this.names[type]}>`)
                }
                else
                {
                    this.logger.success(`[${this.mod}] removed from blacklist: ${type} <${this.names[type]}>`)
                }
            })
            fence.blacklist = bc
        }

    }

    private scaleMinMax(input: MinMax, multi: number, round: boolean): MinMax
    {
        return {
            max: round ? Math.round(input.max * multi) : input.max,
            min: round ? Math.round(input.min * multi) : input.min
        }
    }

}

module.exports = { mod: new SkyTweaks() }