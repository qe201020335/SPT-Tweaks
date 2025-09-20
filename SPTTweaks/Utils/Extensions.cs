using SPTarkov.Server.Core.Models.Eft.Common.Tables;

namespace SPTTweaks.Utils;

internal static class Extensions
{
    public static void SetCurrentMinMax(this CurrentMinMax self, double? current = null, double? min = null,
        double? max = null)
    {
        if (current.HasValue) self.Current = current.Value;
        if (min.HasValue) self.Minimum = min.Value;
        if (max.HasValue) self.Maximum = max.Value;
    }
}