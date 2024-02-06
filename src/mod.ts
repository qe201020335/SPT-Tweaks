import { DependencyContainer } from "tsyringe";

// SPT types
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { IPreAkiLoadMod } from "@spt-aki/models/external/IPreAkiLoadMod";
import { IDatabaseTables } from "@spt-aki/models/spt/server/IDatabaseTables";
import { ILocationData, ILocations } from "@spt-aki/models/spt/server/ILocations";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";


import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IBotConfig } from "@spt-aki/models/spt/config/IBotConfig";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import * as config from "../config/config.json";
import { RagfairSellHelper } from "@spt-aki/helpers/RagfairSellHelper";
import { IRagfairConfig } from "@spt-aki/models/spt/config/IRagfairConfig";
import { ILocationConfig } from "@spt-aki/models/spt/config/ILocationConfig";

const prisciluId = "Priscilu";

class SkyTweaks implements IPreAkiLoadMod, IPostDBLoadMod {
    mod: string
    logger: ILogger
    names: Map<string, string>

    private container: DependencyContainer

    constructor() {
        this.mod = "SkyTweaks"; // Set name of mod, so we can log it to console later
        this.names = new Map<string, string>()
    }

    public preAkiLoad(container: DependencyContainer): void {
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.logger.info(`[${this.mod}] preAki Loading... `)
        this.container = container

        if (config.ragfair.betterRagfairSellChance) {
            // Override aki's ragfair offer sell chance calculation
            container.afterResolution("RagfairSellHelper", (_t, result: RagfairSellHelper) => 
            {
                result.calculateSellChance = (baseChancePercent: number, averageOfferPriceRub: number, playerListedPriceRub: number) => {
                    const ragfairConfig = container.resolve<ConfigServer>("ConfigServer").getConfig<IRagfairConfig>(ConfigTypes.RAGFAIR)
                    const result = (playerListedPriceRub <= averageOfferPriceRub) 
                        ? baseChancePercent * ragfairConfig.sell.chance.underpriced 
                        : baseChancePercent * Math.pow(ragfairConfig.sell.chance.overpriced, playerListedPriceRub / averageOfferPriceRub - 1)

                    const rounded = Math.round(result)
                    this.logger.info(`[${this.mod}] ragfair offer ${playerListedPriceRub} (avg ${averageOfferPriceRub}), ${rounded}% (${baseChancePercent}%)`);
                    return rounded
                }
            });
        }
        
        this.logger.info(`[${this.mod}] preAki Loaded`);
    }

    public postDBLoad(container: DependencyContainer): void {
        this.logger.debug(`[${this.mod}] postDb Loading... `);

        const databaseServer: DatabaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const configServer = container.resolve<ConfigServer>("ConfigServer")

        const tables = databaseServer.getTables();
        const botConfig = configServer.getConfig<IBotConfig>(ConfigTypes.BOT)
        const ragfairConfig = configServer.getConfig<IRagfairConfig>(ConfigTypes.RAGFAIR)
        const locationConfig = configServer.getConfig<ILocationConfig>(ConfigTypes.LOCATION)

        this.loadItemNames(tables)
        this.filterPriscilu(tables)
        this.lockBotEquipment(tables)
        this.changeBossSpawnRate(tables)
        this.tweakPmcConversion(botConfig)
        this.grenadeLauncherInHoster(tables)
        if (config.ragfair.betterRagfairSellChance) {
            this.updateRagfairSellChance(ragfairConfig)
        }
        this.lootMultiplier(locationConfig)

        // this.logger.info(`[${this.mod}] Misc`)

        this.logger.debug(`[${this.mod}] postDb Loaded`);
    }

    private loadItemNames(tables: IDatabaseTables) {
        this.names.clear()
        const locals = tables.locales.global["en"]
        const dbItems = tables.templates.items
        for (const dbItemsKey in dbItems) {
            const item = dbItems[dbItemsKey]
            if (`${item._id} Name` in locals) {
                this.names[item._id] = locals[`${item._id} Name`]
            } else {
                this.names[item._id] = item._name
            }
            if (config.verboseLogging) this.logger.debug(`[${this.mod}] ${item._id}:${this.names[item._id]}`)
        }
        this.logger.info(`[${this.mod}] item names Loaded`)
    }

    private filterPriscilu(tables: IDatabaseTables) {
        this.logger.info(`[${this.mod}] Filtering Priscilu's Items`)
        if (!(prisciluId in tables.traders)) {
            this.logger.warning(`[${this.mod}] Priscilu not installed, skipped.`)
            return
        }
        const priscilu = tables.traders[prisciluId]
        const dbItems = tables.templates.items
        const exceptions = new Set<string>(config.PrisciluException)

        let removed = 0
        priscilu.assort.items = priscilu.assort.items.filter((item) => {
            const dbItem = dbItems[item._tpl]
            if (exceptions.has(item._tpl) || dbItem._props.CanSellOnRagfair === false) {
                return true;
            }
            removed++;
            return false
        });
        this.logger.success(`[${this.mod}] Priscilu's Items removed: ${removed}`)
    }

    private changeBossSpawnRate(tables: IDatabaseTables) {
        this.logger.info(`[${this.mod}] Modifying boss spawn rate`)

        const locations = tables.locations;
        const bossSpawn = config.bossSpawn

        if (config.unifiedBossSpawn && !isNaN(config.unifiedBossSpawnChance)) {
            this.logger.info(`[${this.mod}] Boss spawn rate is UNIFIED!`)
            this.unifiedBossSpawnMod(locations, config.unifiedBossSpawnChance)
            return
        }

        this.logger.info(`[${this.mod}] Boss spawn rate is per boss.`)

        for (const bName in bossSpawn) {
            const unified = bossSpawn[bName]["unified"] === true
            if (unified) {
                const chance = bossSpawn[bName]["unifiedSpawn"]
                if (!isNaN(chance)) {
                    this.unifiedPerBossSpawnMod(bName, locations, chance)
                }
            }
            //TODO non-unified boss spawn chance
        }
    }

    private unifiedBossSpawnMod(locations: ILocations, chance: number) {
        for (const i in locations) {
            const location: ILocationData = locations[i];
            if (i === "base") {
                continue
            }
            location.base.BossLocationSpawn.forEach((spawn) => {
                spawn.BossChance = chance
                this.logger.success(`[${this.mod}] ${spawn.BossName}@${location.base.Name} (${i}) spawn chance: ${spawn.BossChance}%`);
            })
        }
    }

    private unifiedPerBossSpawnMod(bossName: string, locations: ILocations, chance: number) {
        for (const i in locations) {
            const location: ILocationData = locations[i];
            if (i === "base") {
                continue
            }
            location.base.BossLocationSpawn.forEach((spawn) => {
                if (spawn.BossName.toLowerCase() === bossName.toLowerCase()) {
                    this.logger.success(`[${this.mod}] ${bossName}@${location.base.Name} (${i}) spawn chance: ${chance}%`);
                    spawn.BossChance = chance
                }
            })
        }
    }

    private lockBotEquipment(tables: IDatabaseTables) {
        this.logger.info(`[${this.mod}] Locking Bots' Equipments`)
        const bots = tables.bots.types
        const botsEquip = config.botsEquip

        for (const botName in botsEquip) {
            for (const equipLocation in botsEquip[botName]) {
                const itemId = botsEquip[botName][equipLocation]
                this.logger.debug(`[${this.mod}] ${botName}:${equipLocation}:${itemId}`)
                if (itemId in tables.templates.items) {
                    const bot = bots[botName]
                    const equipment: Record<string, number> = bot.inventory.equipment[equipLocation]
                    for (const equipmentKey in equipment) {
                        equipment[equipmentKey] = 0
                    }
                    equipment[itemId] = 100
                    bot.chances.equipment[equipLocation] = 100
                    this.logger.success(`[${this.mod}] ${botName}'s ${equipLocation} locked as <${this.names[itemId]}>`)
                } else {
                    this.logger.warning(`[${this.mod}] item ${itemId} not found!`)
                }
            }
            // TODO: lock equipment mods
        }

    }

    private tweakPmcConversion(botConfig: IBotConfig) {
        this.logger.info(`[${this.mod}] Changing PMC conversion rate`)
        const conv = config.pmcConversion

        for (const botName in conv) {
            const rate = conv[botName]
            if (isNaN(rate)) {
                this.logger.error(`[${this.mod}] PMC from ${botName} conversion rate is not a number: ${rate}`)
            } else {
                botConfig.pmc.convertIntoPmcChance[botName].min = rate
                botConfig.pmc.convertIntoPmcChance[botName].max = rate
                this.logger.success(`[${this.mod}] PMC from ${botName} conversion rate: ${rate}%`)
            }
        }
    }

    private grenadeLauncherInHoster(tables: IDatabaseTables) {
        this.logger.info(`[${this.mod}] Allowing grenade in hoster`)
        const dbItems = tables.templates.items
        dbItems["55d7217a4bdc2d86028b456d"]._props.Slots[2]._props.filters[0].Filter.push("5447bedf4bdc2d87278b4568");
        // for (const itemId in dbItems) {
        //     const item = dbItems[itemId]
        //     if (item._props.weapClass === "grenadeLauncher") {
        //         this.logger.success(`[${this.mod}] Allowing in holster`)
        //         item._props.weapUseType = "secondary"
        //     }
        // }
    }

    private updateRagfairSellChance(ragfairConfig: IRagfairConfig) {
        ragfairConfig.sell.chance.base = config.ragfair.baseSellChance
        ragfairConfig.sell.chance.underpriced = 100 / ragfairConfig.sell.chance.base
        ragfairConfig.sell.chance.overpriced = config.ragfair.overpriceSellChanceCoef
        ragfairConfig.sell.expireSeconds = config.ragfair.cancelWaitTime
        this.logger.success(`[${this.mod}] Ragfair sell chance: ${ragfairConfig.sell.chance.base}% [${ragfairConfig.sell.chance.overpriced}%, ${ragfairConfig.sell.chance.underpriced}%] `)
    }

    private lootMultiplier(locationConfig: ILocationConfig) {
        this.logger.info(`[${this.mod}] Multiplying loot`)
        if (config.loot.useGlobal) {
            const globalMulti = config.loot.globalMultiplier
            for (const location in locationConfig.looseLootMultiplier) {
                locationConfig.looseLootMultiplier[location] *= globalMulti
                locationConfig.staticLootMultiplier[location] = globalMulti
                this.logger.success(`[${this.mod}] ${location} loot multiplier: ${locationConfig.looseLootMultiplier[location]}, ${locationConfig.staticLootMultiplier[location]}`)
            }
            return
        }
        for (const location in config.loot.locations) {
            const multi = config.loot.locations[location]
            locationConfig.looseLootMultiplier[location] *= multi
            locationConfig.staticLootMultiplier[location] = multi
            this.logger.success(`[${this.mod}] ${location} loot multiplier: ${locationConfig.looseLootMultiplier[location]}, ${locationConfig.staticLootMultiplier[location]}`)
        }
        
    }
}

module.exports = {mod: new SkyTweaks()}