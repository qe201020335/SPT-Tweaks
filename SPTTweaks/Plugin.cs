using System.Threading.Tasks;
using JetBrains.Annotations;
using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.Models.External;
using SPTarkov.Server.Core.Models.Utils;

namespace SPTTweaks;

[Injectable(InjectionType.Singleton)]
[UsedImplicitly]
internal class Plugin(ISptLogger<Plugin> logger) : IPreSptLoadModAsync
{
    Task IPreSptLoadModAsync.PreSptLoadAsync()
    {
        logger.Info("SPTTweaks PreSptLoad");
        return Task.CompletedTask;
    }
}