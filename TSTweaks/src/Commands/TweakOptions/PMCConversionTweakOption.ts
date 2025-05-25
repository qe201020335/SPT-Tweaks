import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { IPmcConfig } from "@spt-aki/models/spt/config/IPmcConfig";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { CommandTweakOption } from "./CommandTweakOption";

export class PMCConversionTweakOption extends CommandTweakOption
{
    public static readonly prefix: string = "pmcConv"

    getValue(tokens: string[]): string
    {
        if (tokens.length > 1)
        {
            return "Too many arguments"
        }
        const configServer = this.container.resolve<ConfigServer>("ConfigServer")
        const pmcConfig = configServer.getConfig<IPmcConfig>(ConfigTypes.PMC)

        if (tokens.length == 0)
        {
            return JSON.stringify(pmcConfig.convertIntoPmcChance, null, 2)
        }

        const botType = tokens[0]
        const ratio = pmcConfig.convertIntoPmcChance[botType]
        if (ratio)
        {
            return `[${ratio.min}% - ${ratio.max}%]`
        }
        else
        {
            return "Impossible"
        }
    }

    setValue(tokens: string[]): string
    {
        if (tokens.length > 3)
        {
            return "Too many arguments"
        }

        if (tokens.length < 2)
        {
            return "Not enough arguments"
        }

        const botType = tokens[0]
        //TODO check bot type

        const configServer = this.container.resolve<ConfigServer>("ConfigServer")
        const pmcConfig = configServer.getConfig<IPmcConfig>(ConfigTypes.PMC)

        const ratio = Number.parseFloat(tokens[1])
        if (Number.isNaN(ratio))
        {
            return "Not a number"
        }

        pmcConfig.convertIntoPmcChance[botType] = { max: ratio, min: ratio }
        return "Success"
    }

}