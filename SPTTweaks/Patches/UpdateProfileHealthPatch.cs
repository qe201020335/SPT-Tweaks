using System;
using System.Collections.Generic;
using System.Reflection;
using System.Reflection.Emit;
using HarmonyLib;
using JetBrains.Annotations;
using Microsoft.Extensions.DependencyInjection;
using SPTarkov.DI.Annotations;
using SPTarkov.Reflection.Patching;
using SPTarkov.Server.Core.Controllers;
using SPTarkov.Server.Core.DI;
using SPTarkov.Server.Core.Models.Eft.Common;
using SPTarkov.Server.Core.Models.Eft.Common.Tables;
using SPTarkov.Server.Core.Models.Eft.Profile;
using SPTarkov.Server.Core.Models.Utils;
using SPTarkov.Server.Core.Services;
using SPTTweaks.Configuration;

namespace SPTTweaks.Patches;

[UsedImplicitly]
public class UpdateProfileHealthPatch : AbstractPatch
{
    protected override MethodBase GetTargetMethod()
    {
        Console.WriteLine("[SPTTweaks] UpdateProfileHealthPatch GetTargetMethod");
        return typeof(GameController).GetMethod(
            nameof(GameController.GameStart),
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)!;
    }

    private static readonly MethodInfo UpdateProfileHealthMethod = typeof(GameController).GetMethod(
        nameof(GameController.UpdateProfileHealthValues),
        BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)!;

    private static readonly MethodInfo ProcessMethod = typeof(UpdateProfileHealthPatch).GetMethod(
        nameof(ProcessProfile), BindingFlags.Static | BindingFlags.NonPublic)!;

    [PatchTranspiler]
    private static IEnumerable<CodeInstruction> Transpiler(IEnumerable<CodeInstruction> instructions)
    {
        try
        {
            var matcher = new CodeMatcher(instructions);
            matcher.MatchEndForward(
                    new CodeMatch(OpCodes.Call, UpdateProfileHealthMethod))
                .ThrowIfInvalid("Failed to find call to UpdateProfileHealth")
                .Insert(
                    new CodeInstruction(OpCodes.Ldloc_0),
                    new CodeInstruction(OpCodes.Ldloc_1),
                    new CodeInstruction(OpCodes.Call, ProcessMethod));
            Console.WriteLine("[SPTTweaks] UpdateProfileHealthPatch GameStart patched");
            return matcher.InstructionEnumeration();
        }
        catch (Exception e)
        {
            Console.WriteLine(e);
            throw;
        }
    }

    private static void ProcessProfile(SptProfile sptProfile, PmcData pmcData)
    {
        Console.WriteLine("[SPTTweaks] UpdateProfileHealthPatch Processing profile health");
        ServiceLocator.ServiceProvider.GetRequiredService<ProfileHealthUpdater>().UpdateHealth(sptProfile, pmcData);
    }

    [Injectable]
    private class ProfileHealthUpdater(
        ISptLogger<ProfileHealthUpdater> logger,
        ConfigManager configManager,
        DatabaseService databaseService)
    {
        private readonly PluginConfig _config = configManager.Config;

        public void UpdateHealth(SptProfile sptProfile, PmcData pmcData)
        {
            if (!_config.Profile.Enable || pmcData.Health is null) return;
            logger.Info("[SPTTweaks] ProfileHealthUpdater updating profile health");
            var profileTemplates = databaseService.GetProfileTemplates();

            var sides = profileTemplates[sptProfile.ProfileInfo!.Edition!];
            var template = pmcData.Info!.Side == "Bear" ? sides.Bear?.Character?.Health : sides.Usec?.Character?.Health;

            if (template == null)
            {
                logger.Warning($"No health template found for side {pmcData.Info!.Side}");
                return;
            }

            var health = pmcData.Health;
            health.Immortal = template.Immortal;
            UpdateCurrentMax(health.Energy, template.Energy?.Maximum);
            UpdateCurrentMax(health.Hydration, template.Hydration?.Maximum);
            if (health.BodyParts == null || template.BodyParts == null) return;
            foreach (var bodyPart in health.BodyParts)
            {
                if (template.BodyParts.TryGetValue(bodyPart.Key, out var bodyPartTemplate))
                {
                    UpdateCurrentMax(bodyPart.Value.Health, bodyPartTemplate.Health?.Maximum);
                }
                else
                {
                    logger.Warning($"Body part <{bodyPart.Key}> not found in template");
                }
            }

            logger.Success($"Profile health updated for {sptProfile.ProfileInfo.Username}");
        }

        private static void UpdateCurrentMax(CurrentMinMax? minMax, double? newMax)
        {
            if (minMax == null || minMax.Maximum == null || minMax.Current == null || newMax == null) return;
            var percent = minMax.Current.Value / (double)minMax.Maximum;
            percent = Math.Min(percent, 1);
            minMax.Maximum = newMax;
            minMax.Current = (int)(percent * newMax.Value);
        }
    }
}
