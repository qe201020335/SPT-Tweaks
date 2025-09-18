# SPT-Tweaks

A collection of tweaks for the [SPT](https://sp-tarkov.com/) server.

- TSTweaks: TypeScript version of this mod for SPT 3.9.x
- SPTTweaks: C# version of this mod for SPT 4.x+ (WIP)

## Auto Copy to Game Folder (SPT 4.x+)

In order to automatically copy the compiled mod to your SPT server folder when building,
please create the file `SPTTweaks/SPTTweaks.csproj.user` and add your SPT server path.

```xml
<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="Current" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <PropertyGroup>
    <!-- Set YOUR OWN SPT path here -->
    <SPTPath>T:\SPT\4.0.x\0.16.9.0.39390\Escape from Tarkov</SPTPath>
  </PropertyGroup>
</Project>
```