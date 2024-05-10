import {IUserDialogInfo} from "@spt-aki/models/eft/profile/IAkiProfile";
import {ISendMessageRequest} from "@spt-aki/models/eft/dialog/ISendMessageRequest";
import {DependencyContainer} from "tsyringe";
import {ILogger} from "@spt-aki/models/spt/utils/ILogger";
import {MailSendService} from "@spt-aki/services/MailSendService";
import {IChatCommand} from "@spt-aki/helpers/Dialogue/Commando/IChatCommand";
import {CommandTweakOption} from "./TweakOptions/CommandTweakOption";
import {PMCConversionTweakOption} from "./TweakOptions/PMCConversionTweakOption";

export class TweaksChatCommand implements IChatCommand
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

        let isGet: boolean;
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