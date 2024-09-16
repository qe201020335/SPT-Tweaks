import { DependencyContainer } from "tsyringe";
import path from "path";
import fs from "node:fs";

// SPT types
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod";
import { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables";
import { ILocations } from "@spt/models/spt/server/ILocations";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { RagfairSellHelper } from "@spt/helpers/RagfairSellHelper";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import { ILocationConfig } from "@spt/models/spt/config/ILocationConfig";
import { IInsuranceConfig } from "@spt/models/spt/config/IInsuranceConfig";
import { FenceConfig, ITraderConfig } from "@spt/models/spt/config/ITraderConfig";
import { ILooseLoot } from "@spt/models/eft/common/ILooseLoot";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { MathUtil } from "@spt/utils/MathUtil";
import { ILocationBase } from "@spt/models/eft/common/ILocationBase";
import { IHttpConfig } from "@spt/models/spt/config/IHttpConfig";
import { Serializer, TweakConfig } from "./config";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import { IBotConfig } from "@spt/models/spt/config/IBotConfig";
import { IQuest } from "@spt/models/eft/common/tables/IQuest";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { IRepairConfig } from "@spt/models/spt/config/IRepairConfig";
import { RepairHelper } from "@spt/helpers/RepairHelper";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { Item } from "@spt/models/eft/common/tables/IItem";
import { IPostSptLoadMod } from "@spt/models/external/IPostSptLoadMod";
import { CommandoDialogueChatBot } from "@spt/helpers/Dialogue/CommandoDialogueChatBot";
import { TweaksChatCommand } from "./Commands/TweaksChatCommand";
import { ILocation } from "@spt/models/eft/common/ILocation";

const prisciluId = "Priscilu";

interface ICommonRelativeProbability
{
    relativeProbability: number;
}

class SkyTweaks implements IPreSptLoadMod, IPostDBLoadMod, IPostSptLoadMod
{
    private readonly mod: string
    private readonly names: Map<string, string>
    private readonly config: TweakConfig = new TweakConfig()

    private container: DependencyContainer
    private logger: ILogger
    private jsonUtil: JsonUtil
    private mathUtil: MathUtil

    constructor()
    {
        this.mod = "SkyTweaks"; // Set name of mod, so we can log it to console later
        this.names = new Map<string, string>()
        this.loadOrCreateConfigFile()
    }

    private loadOrCreateConfigFile()
    {
        const configDir = path.resolve(__dirname, "..", "config")
        const configPath = path.resolve(configDir, "config.json")
        if (fs.existsSync(configPath))
        {
            fs.copyFileSync(configPath, configPath + ".bak.json")
            console.log(`[${this.mod}] config file backup finish`)
            Serializer.populateFromJsonString(this.config, fs.readFileSync(configPath).toString())
            console.log(`[${this.mod}] config loaded`)
        }
        else
        {
            fs.mkdirSync(configDir, { recursive: true })
        }

        fs.writeFileSync(configPath, Serializer.serializeToJsonString(this.config));
    }

    public preSptLoad(container: DependencyContainer): void
    {
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.logger.info(`[${this.mod}] preAki Loading... `)
        this.container = container
        this.jsonUtil = container.resolve<JsonUtil>("JsonUtil")
        this.mathUtil = container.resolve<MathUtil>("MathUtil")
        const configServer = container.resolve<ConfigServer>("ConfigServer")

        if (this.config.ragfair.betterRagfairSellChance)
        {
            // Override aki's ragfair offer sell chance calculation
            container.afterResolution("RagfairSellHelper", (_t, result: RagfairSellHelper) =>
            {
                result.calculateSellChance = (averageOfferPriceRub: number, playerListedPriceRub: number, qualityMultiplier: number) =>
                {
                    const chances = container.resolve<ConfigServer>("ConfigServer").getConfig<IRagfairConfig>(ConfigTypes.RAGFAIR).sell.chance
                    const base = chances.base * qualityMultiplier;
                    const result = base * Math.min(1, Math.pow(this.config.ragfair.overpriceSellChanceCoef, playerListedPriceRub / averageOfferPriceRub - 1))
                    const rounded = Math.max(chances.minSellChancePercent, Math.min(chances.maxSellChancePercent, Math.round(result)))
                    this.logger.info(`[${this.mod}] ragfair offer ${playerListedPriceRub} (avg ${averageOfferPriceRub}), ${rounded}%`);
                    return rounded
                }
            });
            this.logger.success(`[${this.mod}] RagfairSellHelper functions hooked.`)
        }

        if (this.config.repair.enable)
        {
            const repairConfig = configServer.getConfig<IRepairConfig>(ConfigTypes.REPAIR)
            repairConfig.applyRandomizeDurabilityLoss = !this.config.repair.noRepairDamage
            if (this.config.repair.resetDurability)
            {
                container.afterResolution("RepairHelper", (_t, result: RepairHelper) =>
                {
                    result.updateItemDurability = (
                        itemToRepair: Item,
                        itemToRepairDetails: ITemplateItem,
                        isArmor: boolean,
                        amountToRepair: number,
                        useRepairKit: boolean,
                        traderQualityMultipler: number,
                        applyMaxDurabilityDegradation = true
                    ): void =>
                    {
                        const maxDura = itemToRepairDetails._props.MaxDurability ?? itemToRepair.upd?.Repairable?.MaxDurability ?? 100

                        // make it brand new :D
                        itemToRepair.upd.Repairable = { Durability: maxDura, MaxDurability: maxDura };

                        // Repair mask cracks
                        if (itemToRepair.upd.FaceShield && itemToRepair.upd.FaceShield?.Hits > 0)
                        {
                            itemToRepair.upd.FaceShield.Hits = 0;
                        }
                    }
                })
                this.logger.success(`[${this.mod}] RepairHelper functions hooked.`)
            }
        }

        if (this.config.enableGiveCommand)
        {
            const coreConfig = configServer.getConfig<ICoreConfig>(ConfigTypes.CORE)
            coreConfig.features.chatbotFeatures.commandoEnabled = true
            coreConfig.features.chatbotFeatures.commandoFeatures.giveCommandEnabled = true
            this.logger.success(`[${this.mod}] Commando give command enabled`);
        }

        const httpConfig = configServer.getConfig<IHttpConfig>(ConfigTypes.HTTP)
        httpConfig.ip = this.config.network.listenIp
        httpConfig.backendIp = this.config.network.backendIp
        this.logger.info(`[${this.mod}] Using backend <${httpConfig.backendIp}> listened on <${httpConfig.ip}>`);

        this.logger.info(`[${this.mod}] preAki Loaded`);
    }

    public postAkiLoad(container: DependencyContainer)
    {
        if (this.config.enableTweaksCommand)
        {
            container
                .resolve<CommandoDialogueChatBot>("CommandoDialogueChatBot")
                .registerChatCommand(new TweaksChatCommand(container))

            this.logger.info(`[${this.mod}] TweaksCommand registered`)
        }
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
        const botConfig = configServer.getConfig<IBotConfig>(ConfigTypes.BOT)

        this.loadItemNames(tables)

        if (this.config.repair.noRepairDamage)
        {
            this.removeRepairDamage(tables)
        }

        if (this.config.item.enable)
        {
            this.tweakItems(tables)
            if (this.config.item.noInventoryLimits)
            {
                const globals = tables.globals.config
                globals.RestrictionsInRaid = []
                this.logger.success(`[${this.mod}] All inventory item limits removed`)
            }
        }
        this.tweakInsurance(tables, configServer)

        if (this.config.botEquipments.enable)
        {
            this.lockBotEquipment(tables)
            this.tweakBot(botConfig)
        }

        if (this.config.pmc.enable)
        {
            this.tweakPmc(pmcConfig)
        }

        this.allowThingsInHolster(tables)

        if (this.config.noFallDamage)
        {
            const health = tables.globals.config.Health
            health.Falling.DamagePerMeter = 0;
            health.Falling.SafeHeight = 200;
            this.logger.success(`[${this.mod}] no more fall damage`)
        }

        if (this.config.priscilu.filterPriscilu)
        {
            this.filterPriscilu(tables)
        }

        if (this.config.bossSpawn.enable)
        {
            this.changeBossSpawnRate(tables)
        }

        if (this.config.ragfair.betterRagfairSellChance)
        {
            this.updateRagfairSellChance(ragfairConfig)
            tables.globals.config.RagFair.minUserLevel = this.config.ragfair.accessLevel
            this.logger.success(`[${this.mod}] ragfair min level: ${tables.globals.config.RagFair.minUserLevel}`)
        }

        if (this.config.loot.enable)
        {
            this.lootMultiplier(locationConfig, tables.locations)
        }

        if (this.config.trader.enable)
        {
            this.tweakTraders(traderConfig)
        }

        if (this.config.raid.enable)
        {
            this.tweakRaids(tables.locations)
        }

        if (this.config.quest.enable)
        {
            this.tweakQuests(tables.templates.quests)
        }

        if (this.config.exp.enable)
        {
            this.tweakExp(tables)
        }

        // this.logger.info(`[${this.mod}] Misc`)

        this.logger.debug(`[${this.mod}] postDb Loaded`);
    }

    public postSptLoad(container: DependencyContainer)
    {
        if (this.config.enableTweaksCommand)
        {
            container
                .resolve<CommandoDialogueChatBot>("CommandoDialogueChatBot")
                .registerChatCommand(new TweaksChatCommand(container))

            this.logger.info(`[${this.mod}] TweaksCommand registered`)
        }
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
            if (this.config.verboseLogging) this.logger.debug(`[${this.mod}] ${item._id}:${this.names[item._id]}`)
        }
        this.logger.info(`[${this.mod}] item names Loaded`)
    }

    private removeRepairDamage(tables: IDatabaseTables)
    {
        this.logger.info(`[${this.mod}] Removing repair damage`)
        const dbItems = tables.templates.items
        for (const id in dbItems)
        {
            const item = dbItems[id]
            if (this.config.repair.noRepairDamage && item._props.MaxRepairDegradation !== undefined && item._props.MaxRepairKitDegradation !== undefined)
            {
                item._props.MinRepairDegradation = 0;
                item._props.MaxRepairDegradation = 0;
                item._props.MinRepairKitDegradation = 0;
                item._props.MaxRepairKitDegradation = 0;
                if (this.config.verboseLogging) this.logger.debug("[no repair damage] " + this.names[id])
            }
        }

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

    private tweakItems(tables: IDatabaseTables)
    {
        this.logger.info(`[${this.mod}] Tweaking individual items`)
        const config = this.config.item
        const itemHelper = this.container.resolve<ItemHelper>("ItemHelper")

        const dbItems = tables.templates.items
        for (const id in dbItems)
        {
            const item = dbItems[id]
            if (config.infiniteKeyUsage && (item._parent == BaseClasses.KEY_MECHANICAL || item._parent == BaseClasses.KEYCARD) && item._props.MaximumNumberOfUsage !== undefined)
            {
                item._props.MaximumNumberOfUsage = 0
                if (this.config.verboseLogging) this.logger.debug("[no usage limit] " + this.names[id])
            }

            if (config.allGunFullauto && (itemHelper.isOfBaseclass(item._id, BaseClasses.WEAPON)))
            {
                if (item._props.weapFireType && item._props.bFirerate)
                {
                    if (!item._props.weapFireType.includes("fullauto"))
                    {
                        item._props.weapFireType.push("fullauto")
                        if (item._props.bFirerate <= item._props.SingleFireRate)
                        {
                            item._props.bFirerate = item._props.SingleFireRate
                        }
                        if (this.config.verboseLogging) this.logger.success(`[${this.mod}] Full auto: ${this.names[id]} ${item._props.bFirerate}rpm`)
                    }
                }
                else
                {
                    this.logger.warning(`[${this.mod}] can't make full auto: ${this.names[id]}`)
                }
            }

            if (config.noOverheat && item._props.AllowOverheat !== undefined && item._props.AllowOverheat !== null)
            {
                item._props.AllowOverheat = false
            }
        }

        const multiplyMed = (tpl: string, multiplier: number) =>
        {
            const itemProps = dbItems[tpl]._props
            itemProps.MaxHpResource *= multiplier;
            itemProps.hpResourceRate *= multiplier;
            if (itemProps.effects_damage)
            {
                for (const effect in itemProps.effects_damage)
                {
                    if (itemProps.effects_damage[effect].cost)
                    {
                        itemProps.effects_damage[effect].cost *= multiplier;
                    }
                    // if (itemProps.effects_damage[effect].healthPenaltyMin)
                    // {
                    //     itemProps.effects_damage[effect].healthPenaltyMin *= multiplier;
                    // }
                    // if (itemProps.effects_damage[effect].healthPenaltyMax)
                    // {
                    //     itemProps.effects_damage[effect].healthPenaltyMax *= multiplier;
                    // }
                }
            }
        }

        //grizzly
        multiplyMed("590c657e86f77412b013051d", 20)
        // dbItems["590c657e86f77412b013051d"]._props.MaxHpResource = 36000;
        // dbItems["590c657e86f77412b013051d"]._props.hpResourceRate = 3500;
        // dbItems["590c657e86f77412b013051d"]._props.Width = 1
        // dbItems["590c657e86f77412b013051d"]._props.Height = 1

        //afak
        multiplyMed("60098ad7c2240c0fe85c570a", 10)
        // dbItems["60098ad7c2240c0fe85c570a"]._props.MaxHpResource = 4000;
        // dbItems["60098ad7c2240c0fe85c570a"]._props.hpResourceRate = 600;

        // eod stash
        //"5811ce772459770e9e5f9532:Grids:0:_props:cellsV:148",
        dbItems["5811ce772459770e9e5f9532"]._props.Grids[0]._props.cellsV = 148

        // sicc
        dbItems["5d235bb686f77443f4331278"]._props.Grids[0]._props.cellsV = 8
        dbItems["5d235bb686f77443f4331278"]._props.Grids[0]._props.cellsH = 8

        // thermal bag
        dbItems["5c093db286f7740a1b2617e3"]._props.Grids[0]._props.cellsV = 10
        dbItems["5c093db286f7740a1b2617e3"]._props.Grids[0]._props.cellsH = 10

        // Roubles 1M stack
        dbItems["5449016a4bdc2d6f028b456f"]._props.StackMaxSize = 1000000;

        // STM-9
        // dbItems["60339954d62c9b14ed777c06"]._props.weapFireType = ["single", "burst", "fullauto"]
    }

    private tweakInsurance(tables: IDatabaseTables, configServer: ConfigServer)
    {
        this.logger.info(`[${this.mod}] Buffing insurance`)
        const globals = tables.globals.config;
        const insuranceConfig = configServer.getConfig<IInsuranceConfig>(ConfigTypes.INSURANCE)
        const traders = tables.traders

        insuranceConfig.returnChancePercent["54cb50c76803fa8b248b4571"] = 100;
        insuranceConfig.returnChancePercent["54cb57776803fa99248b456e"] = 100;
        globals.Insurance.MaxStorageTimeInHour = 720;

        traders["54cb50c76803fa8b248b4571"].base.loyaltyLevels.forEach((loyaltyLevel) => {
            loyaltyLevel.insurance_price_coef = 0.01;
        })
        traders["54cb57776803fa99248b456e"].base.loyaltyLevels.forEach((loyaltyLevel) => {
            loyaltyLevel.insurance_price_coef = 0.01;
        })

        traders["54cb50c76803fa8b248b4571"].base.insurance.min_return_hour = 0;
        traders["54cb50c76803fa8b248b4571"].base.insurance.max_return_hour = 1;
        traders["54cb57776803fa99248b456e"].base.insurance.min_return_hour = 0;
        traders["54cb57776803fa99248b456e"].base.insurance.max_return_hour = 1;

        tables.locations.laboratory.base.Insurance = true
        this.logger.success(`[${this.mod}] Insurance is working in The Lab`)
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
        const exceptions = new Set<string>(this.config.priscilu.filterException)

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
        const bossSpawn = this.config.bossSpawn

        if (bossSpawn.unified && !isNaN(bossSpawn.unifiedChance))
        {
            this.logger.info(`[${this.mod}] Boss spawn rate is UNIFIED!`)
            for (const i in locations)
            {
                const location = locations[i];
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
        for (const [bName, bossSpawn] of perBoss)
        {
            if (bossSpawn.unified)
            {
                const chance = bossSpawn.unifiedChance
                if (!isNaN(chance))
                {
                    for (const i in locations)
                    {
                        const location = locations[i];
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
        const botsEquip = this.config.botEquipments.equipmentLocks

        for (const [botName, equipLocks] of botsEquip)
        {
            for (const equipLocation in equipLocks)
            {
                const itemId = equipLocks[equipLocation]
                this.logger.debug(`[${this.mod}] ${botName}:${equipLocation}:${itemId}`)
                if (itemId in tables.templates.items)
                {
                    const bot = bots[botName]
                    const newEquip: Record<string, number> = {}
                    newEquip[itemId] = 1
                    bot.inventory.equipment[equipLocation] = newEquip
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

    private tweakBot(botConfig: IBotConfig)
    {
        if (this.config.botEquipments.removeInventoryLimits)
        {
            this.logger.info(`[${this.mod}] Removing bot inventory item limits`)
            const limitToKeep = new Set<string>(this.config.botEquipments.inventoryLimitToKeep)
            for (const bot in botConfig.itemSpawnLimits)
            {
                const newLimit = {}
                for (const itemClass in botConfig.itemSpawnLimits[bot])
                {
                    if (limitToKeep.has(itemClass))
                    {
                        newLimit[itemClass] = botConfig.itemSpawnLimits[bot][itemClass]
                    }
                    else
                    {
                        this.logger.success(`[${this.mod}] Removed <${this.names[itemClass]}> limit <${botConfig.itemSpawnLimits[bot][itemClass]}> from <${bot}>`)
                    }
                }
                botConfig.itemSpawnLimits[bot] = newLimit
            }
        }
    }

    private tweakPmc(pmcConfig: IPmcConfig)
    {
        const pmc = this.config.pmc
        pmcConfig.forceHealingItemsIntoSecure = pmc.forceHealingItemsIntoSecure

        if (pmc.filterLootBlacklist)
        {
            pmcConfig.vestLoot.blacklist = this.filterBlacklist("PMC vest loot", pmcConfig.vestLoot.blacklist, pmc.blacklistException)
            pmcConfig.pocketLoot.blacklist = this.filterBlacklist("PMC pocket loot", pmcConfig.pocketLoot.blacklist, pmc.blacklistException)
            pmcConfig.backpackLoot.blacklist = this.filterBlacklist("PMC backpack loot", pmcConfig.backpackLoot.blacklist, pmc.blacklistException)
        }

        this.logger.info(`[${this.mod}] Changing PMC conversion rate`)

        for (const [botName, rate] of pmc.pmcConversion)
        {
            if (isNaN(rate))
            {
                this.logger.error(`[${this.mod}] PMC from ${botName} conversion rate is not a number: ${rate}`)
            }
            else
            {
                pmcConfig.convertIntoPmcChance[botName] = { min: rate, max: rate }
                this.logger.success(`[${this.mod}] PMC from ${botName} conversion rate: ${rate}%`)
            }
        }

        pmcConfig.isUsec = pmc.usecChance;
        this.logger.success(`[${this.mod}] PMC is USEC chance: ${pmcConfig.isUsec}%`)

        pmcConfig.chanceSameSideIsHostilePercent = pmc.sameSideHostileChance;
        this.logger.success(`[${this.mod}] PMC same side hostile chance: ${pmcConfig.chanceSameSideIsHostilePercent}%`)
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
        ragfairConfig.sell.chance.base = this.config.ragfair.baseSellChance
        ragfairConfig.sell.chance.minSellChancePercent = this.config.ragfair.minSellChance
        ragfairConfig.sell.chance.maxSellChancePercent = this.config.ragfair.maxSellChance
        ragfairConfig.sell.expireSeconds = this.config.ragfair.cancelWaitTime
        this.logger.success(`[${this.mod}] Ragfair sell chance: ${ragfairConfig.sell.chance.base}% [${ragfairConfig.sell.chance.minSellChancePercent}%, ${ragfairConfig.sell.chance.maxSellChancePercent}%] `)
    }

    private lootMultiplier(locationConfig: ILocationConfig, locations: ILocations)
    {
        this.logger.info(`[${this.mod}] Multiplying loot`)
        if (this.config.loot.useGlobalMultiplier)
        {
            const globalMulti = this.config.loot.globalMultiplier
            for (const location in locationConfig.looseLootMultiplier)
            {
                locationConfig.looseLootMultiplier[location] *= globalMulti
                locationConfig.staticLootMultiplier[location] *= globalMulti
                this.logger.success(`[${this.mod}] ${location} loot multiplier: ${locationConfig.looseLootMultiplier[location]}, ${locationConfig.staticLootMultiplier[location]}`)
            }
            return
        }
        for (const [location, multi] of this.config.loot.perLocationMultiplier)
        {
            locationConfig.looseLootMultiplier[location] *= multi
            locationConfig.staticLootMultiplier[location] *= multi
            this.logger.success(`[${this.mod}] ${location} loot multiplier: ${locationConfig.looseLootMultiplier[location]}, ${locationConfig.staticLootMultiplier[location]}`)
        }

        locationConfig.containerRandomisationSettings.enabled = !this.config.loot.disableContainerRandomization

        if (this.config.loot.forceAllSpawnPoints)
        {
            this.logger.info(`[${this.mod}] Forcing all loot spawn points`)
            for (const locationName in locations)
            {
                // this.logger.debug(`[${this.mod}] Attempting ${locationName}`)
                if (locationName != "base" && locationName != "hideout" && locations[locationName]["looseLoot"])
                {
                    const looseLoot: ILooseLoot = locations[locationName]["looseLoot"]

                    looseLoot.spawnpoints.forEach((sp) =>
                    {
                        sp.probability = 1
                    })

                    const numSp = looseLoot.spawnpoints.length + looseLoot.spawnpointsForced.length

                    // not necessary but older version of server doesn't respect IsAlwaysSpawn
                    looseLoot.spawnpointCount.mean = numSp
                    looseLoot.spawnpointCount.std = 0

                    this.logger.success(`[${this.mod}] ${locationName} has ${numSp} loose items`)
                }
            }
        }

        if (this.config.loot.invertLootDistribution)
        {
            this.logger.info(`[${this.mod}] Inverting loot distribution`)
            for (const locationName in locations)
            {
                if (locationName != "base" && locationName != "hideout" && locations[locationName]["looseLoot"])
                {
                    this.logger.debug(`[${this.mod}] Attempting ${locationName}`)
                    const location = locations[locationName] as ILocation;
                    const looseLoot = location.looseLoot
                    const staticLoot = location.staticLoot
                    const staticAmmo = location.staticAmmo

                    if (looseLoot)
                    {

                        const spawnPoints = looseLoot.spawnpoints;

                        for (const spawnPoint of spawnPoints)
                        {
                            const distribution = spawnPoint.itemDistribution;
                            this.invertWeightCommon(distribution);
                            // this.logger.success(`[${this.mod}] inverted weights: ${JSON.stringify(distribution)}`)
                        }
                    }

                    if (staticLoot)
                    {
                        // invert static loot table
                        for (const key in staticLoot)
                        {
                            this.invertWeightCommon(staticLoot[key].itemDistribution);
                            this.invertWeightCommon(staticLoot[key].itemcountDistribution);
                            this.logger.success(`[${this.mod}] ${this.names[key]} loot pool probability distribution inverted`)
                        }
                    }

                    if (staticAmmo)
                    {
                        for (const key in staticAmmo)
                        {
                            this.invertWeightCommon(staticAmmo[key]);
                            this.logger.success(`[${this.mod}] ${key} static ammo pool probability distribution inverted`)
                        }
                    }

                    this.logger.success(`[${this.mod}] ${locationName} loosed loot pool probability distribution inverted`)
                }
            }
        }
    }

    private invertWeightCommon(items: ICommonRelativeProbability[])
    {
        this.invertWeightGeneric(items,
            (item) => item.relativeProbability,
            (item, weight) => item.relativeProbability = weight
        );
    }

    private invertWeightGeneric<T>(items: T[], getWeight: (item: T) => number, setWeight: (item: T, weight: number) => void)
    {
        const itemsCopy = new Array(...items);
        itemsCopy.sort((a, b) => getWeight(a) - getWeight(b)); // sort items by weight
        const weights = items.map(getWeight).sort((a, b) => b - a); // reverse sort weights

        for (let i = 0; i < items.length; i++)
        {
            setWeight(items[i], weights[i])
        }
    }

    private tweakTraders(traderConfig: ITraderConfig)
    {
        this.logger.info(`[${this.mod}] Tweaking traders`)
        const trader = this.config.trader
        traderConfig.purchasesAreFoundInRaid = trader.purchaseFIR
        traderConfig.traderPriceMultipler *= trader.priceMultiplier
        this.logger.success(`[${this.mod}] trader price multi: ${traderConfig.traderPriceMultipler}`)

        this.tweakFence(traderConfig.fence)
    }

    private tweakFence(fence: FenceConfig)
    {
        this.logger.info(`[${this.mod}] Tweaking fence`)
        const conf = this.config.trader.fence

        //assort size
        const sizeMulti = conf.assortSizeMulti
        this.logger.info(`[${this.mod}] multiplying fence listing by ${sizeMulti}`)
        this.scaleMinMax(fence.weaponPresetMinMax, sizeMulti, true)
        this.logger.debug(`[${this.mod}] guns: [${fence.weaponPresetMinMax.min}, ${fence.weaponPresetMinMax.max}]`)
        this.scaleMinMax(fence.equipmentPresetMinMax, sizeMulti, true)
        this.logger.debug(`[${this.mod}] equips: [${fence.equipmentPresetMinMax.min}, ${fence.equipmentPresetMinMax.max}]`)
        let total = 0;
        for (const type in fence.itemTypeLimits)
        {
            fence.itemTypeLimits[type] = Math.round(Math.max(1, fence.itemTypeLimits[type]) * sizeMulti)
            total += fence.itemTypeLimits[type]

            if (this.config.verboseLogging)
            {
                this.logger.debug(`[${this.mod}] ${this.names[type]}: ${fence.itemTypeLimits[type]}`)
            }
        }
        total += fence.weaponPresetMinMax.max
        total += fence.equipmentPresetMinMax.max
        fence.assortSize = Math.ceil(Math.max(total, Math.round(fence.assortSize * sizeMulti)) / 100 + sizeMulti) * 100
        this.logger.success(`[${this.mod}] fence total listing size: ${fence.assortSize}`)

        fence.itemPriceMult *= conf.priceMulti
        fence.presetPriceMult *= conf.priceMulti
        this.logger.success(`[${this.mod}] price multi: ${fence.itemPriceMult}, ${fence.presetPriceMult}`)

        fence.regenerateAssortsOnRefresh = conf.regenerateOnRefresh
        for (const type in fence.chancePlateExistsInArmorPercent)
        {
            fence.chancePlateExistsInArmorPercent[type] = conf.armorWithPlatesChance
        }

        fence.armorMaxDurabilityPercentMinMax.max = { min: conf.maxDurability, max: conf.maxDurability }
        fence.armorMaxDurabilityPercentMinMax.current = { min: conf.minCurrDurability, max: conf.maxDurability }
        this.logger.success(`[${this.mod}] armor dura: [${fence.armorMaxDurabilityPercentMinMax.current.min}, ${fence.armorMaxDurabilityPercentMinMax.max.max}]`)
        fence.weaponDurabilityPercentMinMax.max = { min: conf.maxDurability, max: conf.maxDurability }
        fence.weaponDurabilityPercentMinMax.current = { min: conf.minCurrDurability, max: conf.maxDurability }
        this.logger.success(`[${this.mod}] preset dura: [${fence.weaponDurabilityPercentMinMax.current.min}, ${fence.weaponDurabilityPercentMinMax.max.max}]`)

        for (const type in fence.itemCategoryRoublePriceLimit)
        {
            fence.itemCategoryRoublePriceLimit[type] = Math.round(fence.itemCategoryRoublePriceLimit[type] * conf.priceLimitMulti)
            if (this.config.verboseLogging)
            {
                this.logger.debug(`[${this.mod}] price limit ${fence.itemCategoryRoublePriceLimit[type]} for ${this.names[type]}`)
            }
        }

        if (conf.alwaysFullPreset)
        {
            for (const type in fence.presetSlotsToRemoveChancePercent)
            {
                fence.presetSlotsToRemoveChancePercent[type] = 0
            }
        }


        if (conf.filterBlacklist)
        {
            fence.blacklist = this.filterBlacklist("Fence", fence.blacklist, conf.blacklistException)
        }

    }

    private filterBlacklist(context: string, blacklist: string[], exceptions: string[] = []): string[]
    {
        this.logger.info(`[${this.mod}] Removing things from ${context} blacklist. Some items may be kept due to otherwise buggy behavior`)
        const filtered: string[] = []
        const exceptionsSet = new Set(exceptions)
        let numFiltered = 0
        blacklist.forEach((type) =>
        {
            if (exceptionsSet.has(type))
            {
                filtered.push(type)
                if (this.config.verboseLogging)
                {
                    this.logger.info(`[${this.mod}] kept in blacklist: ${type} <${this.names[type]}>`)
                }
            }
            else
            {
                numFiltered++
                if (this.config.verboseLogging)
                {
                    this.logger.success(`[${this.mod}] removed from blacklist: ${type} <${this.names[type]}>`)
                }
            }
        })
        this.logger.success(`[${this.mod}] removed ${numFiltered} items from blacklist`)
        return filtered
    }

    private scaleMinMax(input: { min: number, max: number }, multi: number, round: boolean)
    {
        input.min = round ? Math.round(input.min * multi) : input.min * multi
        input.max = round ? Math.round(input.max * multi) : input.max * multi
    }

    private tweakRaids(locations: ILocations)
    {
        this.logger.info(`[${this.mod}] Changing raid settings`)
        for (const locationName in locations)
        {
            if (locationName != "base" && locationName != "hideout" && locations[locationName]["base"])
            {
                const locationBase: ILocationBase = locations[locationName]["base"]

                if (this.config.raid.chanceExtractsAlwaysAvailable)
                {
                    locationBase.exits.forEach((exit) =>
                    {
                        if (exit.Chance !== 100)
                        {
                            exit.Chance = 100
                            if (this.config.verboseLogging)
                            {
                                this.logger.debug(`[${this.mod}] ${exit.Name} in ${locationName} is always available`)
                            }
                        }
                    })
                }

                if (locationBase.EscapeTimeLimit)
                {
                    locationBase.EscapeTimeLimit += this.config.raid.extraTime
                    this.logger.success(`[${this.mod}] ${locationName} raid time ${locationBase.EscapeTimeLimit} min`)
                }

                if (locationBase.exit_access_time)
                {
                    // this value seems to be unused, but we change it as well just in case
                    locationBase.exit_access_time += this.config.raid.extraTime
                }
            }
        }
    }

    private tweakQuests(quests: Record<string, IQuest>)
    {
        this.logger.info(`[${this.mod}] Tweaking quests`)
        if (this.config.quest.removeQuestWaitTime)
        {
            for (const questID in quests)
            {
                const quest = quests[questID]
                quest.conditions.AvailableForStart.forEach(condition =>
                {
                    if (condition.conditionType === "Quest" && condition.availableAfter)
                    {
                        const waitHrs = condition.availableAfter / 3600
                        const time = condition.dispersion ? `${waitHrs}-${waitHrs + condition.dispersion / 3600}` : `${waitHrs}`
                        // const prevName = condition.target ? quests[condition.target]?.QuestName ?? "null" : "null"
                        const prevQuests = Array.isArray(condition.target) ? condition.target : [condition.target]

                        const prevName = prevQuests.filter(value => value).map((value) => quests[value]?.QuestName ?? "null").join(" ")

                        this.logger.success(`[${this.mod}] Quest <${quest.QuestName}> no need to wait for <${time}> hrs after <${prevName}>`)
                        condition.availableAfter = 0
                        if (condition.dispersion)
                        {
                            condition.dispersion = 0
                        }
                    }
                })
            }
        }
    }

    private tweakExp(tables: IDatabaseTables)
    {
        const exp = tables.globals.config.exp;
        const multi = this.config.exp.expMultiplier;

        exp.expForLockedDoorBreach = Math.round(exp.expForLockedDoorBreach * multi);
        exp.expForLockedDoorOpen = Math.round(exp.expForLockedDoorOpen * multi);
        exp.heal.expForEnergy = Math.round(exp.heal.expForEnergy * multi);
        exp.heal.expForHeal = Math.round(exp.heal.expForHeal * multi);
        exp.heal.expForHydration = Math.round(exp.heal.expForHydration * multi);
        exp.kill.bloodLossToLitre *= multi;
        exp.kill.botExpOnDamageAllHealth = Math.round(exp.kill.botExpOnDamageAllHealth * multi);
        exp.kill.botHeadShotMult *= multi;
        exp.kill.combo.forEach((item) => item.percent = Math.round(item.percent * multi));
        exp.kill.pmcExpOnDamageAllHealth = Math.round(exp.kill.pmcExpOnDamageAllHealth * multi);
        exp.kill.pmcHeadShotMult *= multi;
        exp.kill.victimBotLevelExp = Math.round(exp.kill.victimBotLevelExp * multi);
        exp.kill.victimLevelExp = Math.round(exp.kill.victimLevelExp * multi);
        exp.loot_attempts.forEach((item) => item.k_exp *= multi);
        exp.match_end.killedMult *= multi;
        exp.match_end.leftMult *= multi;
        exp.match_end.miaMult *= multi;
        exp.match_end.mia_exp_reward = Math.round(exp.match_end.mia_exp_reward * multi);
        exp.match_end.runnerMult *= multi;
        exp.match_end.runner_exp_reward = Math.round(exp.match_end.runner_exp_reward * multi);
        exp.match_end.survivedMult *= multi;
        exp.match_end.survived_exp_reward = Math.round(exp.match_end.survived_exp_reward * multi);
        exp.triggerMult *= multi;

        this.logger.success(`[${this.mod}] Gameplay experience multiplied by ${multi}`)

        // kill reward for each bot
        for (const type in tables.bots.types)
        {
            const bot = tables.bots.types[type];
            const reward = bot.experience.reward;
            if (reward.min > 0 && reward.max > 0)
            {
                this.scaleMinMax(reward, multi, true);
                this.logger.success(`[${this.mod}] Bot ${type} experience reward: [${bot.experience.reward.min}, ${bot.experience.reward.max}]`)
            }
        }
    }
}

module.exports = { mod: new SkyTweaks() }