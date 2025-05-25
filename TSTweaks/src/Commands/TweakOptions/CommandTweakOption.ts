import { DependencyContainer } from "tsyringe";

export abstract class CommandTweakOption
{
    constructor(protected container: DependencyContainer)
    {
    }

    public abstract getValue(tokens: string[]): string

    public abstract setValue(tokens: string[]): string
}