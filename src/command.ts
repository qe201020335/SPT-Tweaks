import {ICommandoCommand} from "@spt-aki/helpers/Dialogue/Commando/ICommandoCommand";
import {IUserDialogInfo} from "@spt-aki/models/eft/profile/IAkiProfile";
import {ISendMessageRequest} from "@spt-aki/models/eft/dialog/ISendMessageRequest";
import {DependencyContainer} from "tsyringe";
import {ILogger} from "@spt-aki/models/spt/utils/ILogger";
import {IPmcConfig} from "@spt-aki/models/spt/config/IPmcConfig";
import {ConfigTypes} from "@spt-aki/models/enums/ConfigTypes";
import {ConfigServer} from "@spt-aki/servers/ConfigServer";
import {MailSendService} from "@spt-aki/services/MailSendService";

export class TweaksCommand implements ICommandoCommand
{
    private logger: ILogger
    protected mailSendService: MailSendService
    private options: Map<string, CommandTweakOption> = new Map<string, CommandTweakOption>()

    constructor(private container: DependencyContainer)
    {
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.mailSendService = container.resolve<MailSendService>("MailSendService")
        this.options.set(PMCConversionTweakOption.prefix, new PMCConversionTweakOption(this.container))
    }

    getCommandHelp(command: string): string
    {
        switch (command)
        {
            case "get":
                return "get usage: tweaks get <option> [args] <value>"
            case "set":
                return "set usage: tweaks set <option> [args]"
        }
        return "Get and Set tweak values, still WIP";
    }

    getCommandPrefix(): string
    {
        return "tweaks";
    }

    getCommands(): Set<string>
    {
        return new Set<string>(["get", "set"])
    }

    handle(command: string, commandHandler: IUserDialogInfo, sessionId: string, request: ISendMessageRequest): string
    {
        this.logger.debug(`[TweaksCommand] received command '${command}': '${request.text}'`)
        const tokens = request.text.split(" ")

        if (tokens.length < 3)
        {
            this.mailSendService.sendUserMessageToPlayer(sessionId, commandHandler, "Not enough arguments")
            return request.dialogId
        }

        let isGet;
        switch (tokens[1])
        {
            case "get":
                isGet = true
                break
            case "set":
                isGet = false
                break
            default:
                this.mailSendService.sendUserMessageToPlayer(sessionId, commandHandler, "Invalid Option")
                return request.dialogId
        }

        const option = this.options.get(tokens[2])
        if (!option)
        {
            this.mailSendService.sendUserMessageToPlayer(sessionId, commandHandler, `Unsupported tweak option: ${tokens[2]}`)
            return request.dialogId
        }


        const subTokens = tokens.slice(3)
        this.logger.debug(`[TweaksCommand] isGet: '${isGet}', subTokens: '${JSON.stringify(subTokens)}'`)
        try
        {
            this.mailSendService.sendUserMessageToPlayer(sessionId, commandHandler, isGet ? option.getValue(subTokens) : option.setValue(subTokens))
        }
        catch (e)
        {
            this.mailSendService.sendUserMessageToPlayer(sessionId, commandHandler, `Failed to process command: ${e}`)
        }

        return request.dialogId
    }

}

abstract class CommandTweakOption
{
    constructor(protected container: DependencyContainer)
    {
    }
    public abstract getValue(tokens: string[]): string
    public abstract setValue(tokens: string[]): string
}

class PMCConversionTweakOption extends CommandTweakOption
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

        pmcConfig.convertIntoPmcChance[botType] = {max: ratio, min: ratio}
        return "Success"
    }

}