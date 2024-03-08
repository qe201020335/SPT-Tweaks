import {DependencyContainer} from "tsyringe";

// SPT types
import {IPostDBLoadMod} from "@spt-aki/models/external/IPostDBLoadMod";
import {IPreAkiLoadMod} from "@spt-aki/models/external/IPreAkiLoadMod";
import {IDatabaseTables} from "@spt-aki/models/spt/server/IDatabaseTables";
import {ILocationData, ILocations} from "@spt-aki/models/spt/server/ILocations";
import {ILogger} from "@spt-aki/models/spt/utils/ILogger";
import {DatabaseServer} from "@spt-aki/servers/DatabaseServer";


import {ConfigTypes} from "@spt-aki/models/enums/ConfigTypes";
import {IPmcConfig} from "@spt-aki/models/spt/config/IPmcConfig";
import {ConfigServer} from "@spt-aki/servers/ConfigServer";
import {RagfairSellHelper} from "@spt-aki/helpers/RagfairSellHelper";
import {IRagfairConfig} from "@spt-aki/models/spt/config/IRagfairConfig";
import {ILocationConfig} from "@spt-aki/models/spt/config/ILocationConfig";
import {IInsuranceConfig} from "@spt-aki/models/spt/config/IInsuranceConfig";

import {FenceConfig, ITraderConfig} from "@spt-aki/models/spt/config/ITraderConfig";
import {MinMax} from "@spt-aki/models/common/MinMax";
import {ILooseLoot, SpawnpointTemplate} from "@spt-aki/models/eft/common/ILooseLoot";
import {JsonUtil} from "@spt-aki/utils/JsonUtil";
import {IStaticAmmoDetails} from "@spt-aki/models/eft/common/tables/ILootBase";
import {LocationGenerator} from "@spt-aki/generators/LocationGenerator";
import {SeasonalEventService} from "@spt-aki/services/SeasonalEventService";
import {LocalisationService} from "@spt-aki/services/LocalisationService";
import {MathUtil} from "@spt-aki/utils/MathUtil";
import {ILocationBase} from "@spt-aki/models/eft/common/ILocationBase";
import {IHttpConfig} from "@spt-aki/models/spt/config/IHttpConfig";
import {TweakConfig, Serializer} from "./config";
import path from "path";
import fs from "node:fs";
import {ICoreConfig} from "@spt-aki/models/spt/config/ICoreConfig";

const prisciluId = "Priscilu";

class SkyTweaks implements IPreAkiLoadMod, IPostDBLoadMod
{
    private readonly mod: string
    private readonly names: Map<string, string>
    private readonly config: TweakConfig = new TweakConfig()

    private container: DependencyContainer
    private logger: ILogger
    private jsonUtil: JsonUtil
    private mathUtil: MathUtil
    private configServer: ConfigServer

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
            fs.copyFileSync(configPath, configPath+".bak")
            Serializer.populateFromJsonString(this.config, fs.readFileSync(configPath).toString())
        }
        else
        {
            fs.mkdirSync(configDir, {recursive: true})
        }

        fs.writeFileSync(configPath, Serializer.serializeToJsonString(this.config));
    }

    public preAkiLoad(container: DependencyContainer): void
    {
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.logger.info(`[${this.mod}] preAki Loading... `)
        this.container = container
        this.jsonUtil = container.resolve<JsonUtil>("JsonUtil")
        this.mathUtil = container.resolve<MathUtil>("MathUtil")
        this.configServer = container.resolve<ConfigServer>("ConfigServer")

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

        if (this.config.loot.enable && this.config.loot._DANGER_forceSpawnAllLoosedLoot_DANEGR_)
        {
            container.afterResolution("LocationGenerator", (_t, result: LocationGenerator) =>
            {
                result.generateDynamicLoot = (
                    dynamicLootDist: ILooseLoot,
                    staticAmmoDist: Record<string, IStaticAmmoDetails[]>,
                    locationName: string
                ): SpawnpointTemplate[] =>
                {
                    this.logger.warning(`[${this.mod}] !!!FORCING ALL LOOSED LOOT TO SPAWN!!! EXPECT LOW IN-GAME PERFORMANCE!!!`)
                    const loot = this.generateDynamicLootOverwrite(result, dynamicLootDist, staticAmmoDist, locationName)
                    this.logger.success(`[${this.mod}] Location ${locationName} total item spawn count: ${loot.length}`)
                    return loot
                }
            })
            this.logger.success(`[${this.mod}] LocationGenerator functions hooked.`)
        }

        if (this.config.enableGiveCommand)
        {
            const coreConfig = this.configServer.getConfig<ICoreConfig>(ConfigTypes.CORE)
            coreConfig.features.chatbotFeatures.commandoEnabled = true
            coreConfig.features.chatbotFeatures.commandoFeatures.giveCommandEnabled = true
            this.logger.success(`[${this.mod}] Commando give command enabled`);
        }

        const httpConfig = this.configServer.getConfig<IHttpConfig>(ConfigTypes.HTTP)
        httpConfig.ip = this.config.httpIP
        
        this.logger.info(`[${this.mod}] preAki Loaded`);
    }

    private generateDynamicLootOverwrite(
        self: LocationGenerator,
        dynamicLootDist: ILooseLoot,
        staticAmmoDist: Record<string, IStaticAmmoDetails[]>,
        locationName: string
    ): SpawnpointTemplate[]
    {
        // some prep work for the protected fields
        const seasonalEventService: SeasonalEventService = self["seasonalEventService"]
        const localisationService: LocalisationService = self["localisationService"]
        const locationConfig: ILocationConfig = self["locationConfig"]

        const loot: SpawnpointTemplate[] = [];

        // Add all forced loot to return array
        // const addForcedLoot: (lootLocationTemplates: SpawnpointTemplate[], forcedSpawnPoints: SpawnpointsForced[], locationName: string) => void = self["addForcedLoot"]
        self["addForcedLoot"](loot, dynamicLootDist.spawnpointsForced, locationName);

        const blacklistedSpawnpoints = locationConfig.looseLootBlacklist[locationName];
        const chosenSpawnpoints = dynamicLootDist.spawnpoints.filter((sp) =>
        {
            return !blacklistedSpawnpoints?.includes(sp.template.Id)
        })

        //=== skip all the random and probability crap ===

        // Iterate over spawnpoints
        const seasonalEventActive = seasonalEventService.seasonalEventEnabled();
        const seasonalItemTplBlacklist = seasonalEventService.getInactiveSeasonalEventItems();
        for (const spawnPoint of chosenSpawnpoints)
        {
            if (!spawnPoint.template)
            {
                this.logger.warning(
                    localisationService.getText("location-missing_dynamic_template", spawnPoint.locationId)
                );

                continue;
            }

            if (!spawnPoint.template.Items || spawnPoint.template.Items.length === 0)
            {
                this.logger.error(
                    localisationService.getText("location-spawnpoint_missing_items", spawnPoint.template.Id)
                );

                continue;
            }

            const itemArray = spawnPoint.itemDistribution.filter((itemDist) =>
            {
                const shouldNotKeep =
                    !seasonalEventActive && seasonalItemTplBlacklist.includes(
                        spawnPoint.template.Items.find((x) => x._id === itemDist.composedKey.key)._tpl
                    )
                return !shouldNotKeep
            })

            if (itemArray.length === 0)
            {
                this.logger.warning(`Loot pool for position: ${spawnPoint.template.Id} is empty. Skipping`);

                continue;
            }

            // skip all the random crap, we want EVERY single possible item to ALL spawn
            for (const itemDist of itemArray)
            {
                const chosenComposedKey = itemDist.composedKey.key
                try
                {
                    const createItemResult = self["createDynamicLootItem"](chosenComposedKey, spawnPoint, staticAmmoDist);

                    // need to clone this
                    // we are creating multiple spawns at the same spawn point
                    const template = this.jsonUtil.clone(spawnPoint.template)
                    template.useGravity = false // or it could take ages to simulation the physical
                    // Root id can change when generating a weapon
                    template.Root = createItemResult.items[0]._id;
                    template.Items = createItemResult.items;

                    loot.push(template);
                }
                catch (e)
                {
                    this.logger.warning(`[${this.mod}] Failed to create loot ${itemDist} at ${spawnPoint.locationId}`);
                }
            }
        }
        return loot
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

        const httpConfig = configServer.getConfig<IHttpConfig>(ConfigTypes.HTTP)

        httpConfig.ip = this.config.httpIP

        this.loadItemNames(tables)
        this.tweakItems(tables)
        this.noArmorRepairDamage(tables)
        this.tweakInsurance(tables, configServer)

        if (this.config.botEquipments.enable)
        {
            this.lockBotEquipment(tables)
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
            if (this.config.verboseLogging) this.logger.debug(`[${this.mod}] ${item._id}:${this.names[item._id]}`)
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
                if (this.config.verboseLogging) this.logger.debug("[no usage limit] " + this.names[id])
            }
            else if (item._props.MaxRepairDegradation !== undefined && item._props.MaxRepairKitDegradation !== undefined)
            {
                item._props.MinRepairDegradation = 0;
                item._props.MaxRepairDegradation = 0;
                item._props.MinRepairKitDegradation = 0;
                item._props.MaxRepairKitDegradation = 0;
                if (this.config.verboseLogging) this.logger.debug("[no repair damage] " + this.names[id])
            }
        }

        dbItems["590c657e86f77412b013051d"]._props.MaxHpResource = 36000;
        dbItems["590c657e86f77412b013051d"]._props.hpResourceRate = 700;

        // stash
        //"5811ce772459770e9e5f9532:Grids:0:_props:cellsV:148",
        dbItems["5811ce772459770e9e5f9532"]._props.Grids[0]._props.cellsV = 148

        // sicc
        dbItems["5d235bb686f77443f4331278"]._props.Grids[0]._props.cellsV = 8
        dbItems["5d235bb686f77443f4331278"]._props.Grids[0]._props.cellsH = 8

        // thermal bag
        dbItems["5c093db286f7740a1b2617e3"]._props.Grids[0]._props.cellsV = 10
        dbItems["5c093db286f7740a1b2617e3"]._props.Grids[0]._props.cellsH = 10
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
        for (const [bName, bossSpawn] of perBoss)
        {
            if (bossSpawn.unified)
            {
                const chance = bossSpawn.unifiedChance
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
                pmcConfig.convertIntoPmcChance[botName] = {min: rate, max: rate}
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
        fence.assortSize = Math.ceil(Math.max(total, Math.round(fence.assortSize * sizeMulti)) / 100 + sizeMulti) * 100
        this.logger.success(`[${this.mod}] fence total listing size: ${fence.assortSize}`)

        fence.itemPriceMult *= conf.priceMulti
        fence.presetPriceMult *= conf.priceMulti
        this.logger.success(`[${this.mod}] price multi: ${fence.itemPriceMult}, ${fence.presetPriceMult}`)

        fence.regenerateAssortsOnRefresh = conf.regenerateOnRefresh
        fence.chancePlateExistsInArmorPercent = conf.armorWithPlatesChance

        fence.armorMaxDurabilityPercentMinMax.max = { min: conf.maxDurability, max: conf.maxDurability }
        fence.armorMaxDurabilityPercentMinMax.current = { min: conf.minCurrDurability, max: conf.maxDurability }
        this.logger.success(`[${this.mod}] armor dura: [${fence.armorMaxDurabilityPercentMinMax.current.min}, ${fence.armorMaxDurabilityPercentMinMax.max.max}]`)
        fence.weaponDurabilityPercentMinMax.max = { min: conf.maxDurability, max: conf.maxDurability }
        fence.weaponDurabilityPercentMinMax.current = { min: conf.minCurrDurability, max: conf.maxDurability }
        this.logger.success(`[${this.mod}] preset dura: [${fence.weaponDurabilityPercentMinMax.current.min}, ${fence.weaponDurabilityPercentMinMax.max.max}]`)

        for (const type in fence.itemCategoryRoublePriceLimit)
        {
            fence.itemCategoryRoublePriceLimit[type] = Math.round(fence.itemCategoryRoublePriceLimit[type] * conf.priceLimitMulti)
            this.logger.success(`[${this.mod}] price limit ${fence.itemCategoryRoublePriceLimit[type]} for ${this.names[type]}`)
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
        blacklist.forEach((type) =>
        {
            if (exceptionsSet.has(type))
            {
                filtered.push(type)
                this.logger.info(`[${this.mod}] kept in blacklist: ${type} <${this.names[type]}>`)
            }
            else
            {
                this.logger.success(`[${this.mod}] removed from blacklist: ${type} <${this.names[type]}>`)
            }
        })
        return filtered
    }

    private scaleMinMax(input: MinMax, multi: number, round: boolean): MinMax
    {
        return {
            max: round ? Math.round(input.max * multi) : input.max,
            min: round ? Math.round(input.min * multi) : input.min
        }
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
                            this.logger.success(`[${this.mod}] ${exit.Name} in ${locationName} is always available`)
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

    private invertWeight(weights: Record<string, number>)
    {
        const highest = Math.max(...Object.values(weights));
        for (const key in weights)
        {
            highest[key] = Math.round((1 / highest[key]) * highest);
        }
        // this.reduceWeightValues(this.backpackLootPool);
    }

}

module.exports = { mod: new SkyTweaks() }