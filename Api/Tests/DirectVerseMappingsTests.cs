using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using BibleNote.Services.ModulesManager.Models;
using BibleNote.Services.ParallelVerses.Contracts;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace BibleNote.Tests
{
    [TestClass]
    public class DirectVerseMappingsTests : TestsBase.TestsBase
    {
        [TestInitialize]
        public void Init()
        {
            base.Init();
        }

        [TestMethod]
        public void Direct_many_to_one_mapping_is_available_in_both_directions()
        {
            var moduleName = $"direct{Guid.NewGuid():N}";
            var packagePath = CreateDirectModulePackage(moduleName);
            try
            {
                ModulesManager.UploadModule(packagePath, moduleName);
                ModulesManager.GetModuleInfo(moduleName).BibleDirectVerseMappings.VerseIdRegistry
                    .Should().Be("bnverse:v1");
                var connector = ServiceProvider.GetRequiredService<IBibleParallelTranslationConnectorManager>();

                var kjvForward = connector.GetParallelBibleInfo("kjv", moduleName);
                kjvForward[1][new ModuleVersePointer(1, 1, 1)].Single().Verse.Should().Be(2);
                kjvForward[1][new ModuleVersePointer(1, 1, 2)].Single().Verse.Should().Be(2);

                var forward = connector.GetParallelBibleInfo("rst", moduleName);
                forward[1][new ModuleVersePointer(1, 1, 1)].Single().Verse.Should().Be(2);
                forward[1][new ModuleVersePointer(1, 1, 2)].Single().Verse.Should().Be(2);

                var reverse = connector.GetParallelBibleInfo(moduleName, "rst");
                reverse[1][new ModuleVersePointer(1, 1, 2)]
                    .Select(pointer => pointer.Verse)
                    .Should().Equal(1, 2);

                var legacyBridge = connector.GetParallelBibleInfo("rst", moduleName);
                legacyBridge[3][new ModuleVersePointer(3, 14, 55)]
                    .Select(pointer => pointer.Verse)
                    .Should().Equal(99);

                var legacyBridgeReverse = connector.GetParallelBibleInfo(moduleName, "rst");
                legacyBridgeReverse[3][new ModuleVersePointer(3, 14, 99)]
                    .Select(pointer => pointer.Verse)
                    .Should().Equal(55);
            }
            finally
            {
                if (File.Exists(packagePath))
                    File.Delete(packagePath);
                ModulesManager.DeleteModule(moduleName);
            }
        }

        [TestMethod]
        public void Direct_mappings_with_a_shared_Kjv_reference_are_composed()
        {
            var firstModule = $"direct{Guid.NewGuid():N}";
            var secondModule = $"direct{Guid.NewGuid():N}";
            var firstPackage = CreateDirectModulePackage(firstModule, @"
  <BibleDirectVerseMappings ReferenceModule=""kjv"" SchemaVersion=""1"" VerseIdRegistry=""bnverse:v1"">
    <BookMappings BookIndex=""1"">
      <Mapping ReferenceChapter=""1"" ReferenceVerse=""1"" ModuleChapter=""1"" ModuleVerse=""1"" />
      <Mapping ReferenceChapter=""1"" ReferenceVerse=""1"" ModuleChapter=""1"" ModuleVerse=""2"" />
    </BookMappings>
  </BibleDirectVerseMappings>");
            var secondPackage = CreateDirectModulePackage(secondModule, @"
  <BibleDirectVerseMappings ReferenceModule=""kjv"" SchemaVersion=""1"" VerseIdRegistry=""bnverse:v1"">
    <BookMappings BookIndex=""1"">
      <Mapping ReferenceChapter=""1"" ReferenceVerse=""1"" ModuleChapter=""1"" ModuleVerse=""3"" />
    </BookMappings>
  </BibleDirectVerseMappings>");
            try
            {
                ModulesManager.UploadModule(firstPackage, firstModule);
                ModulesManager.UploadModule(secondPackage, secondModule);
                var connector = ServiceProvider.GetRequiredService<IBibleParallelTranslationConnectorManager>();

                var forward = connector.GetParallelBibleInfo(firstModule, secondModule);
                forward[1][new ModuleVersePointer(1, 1, 1)].Single().Verse.Should().Be(3);
                forward[1][new ModuleVersePointer(1, 1, 2)].Single().Verse.Should().Be(3);

                var reverse = connector.GetParallelBibleInfo(secondModule, firstModule);
                reverse[1][new ModuleVersePointer(1, 1, 3)]
                    .Select(pointer => pointer.Verse)
                    .Should().Equal(1, 2);
            }
            finally
            {
                if (File.Exists(firstPackage))
                    File.Delete(firstPackage);
                if (File.Exists(secondPackage))
                    File.Delete(secondPackage);
                ModulesManager.DeleteModule(firstModule);
                ModulesManager.DeleteModule(secondModule);
            }
        }

        [TestMethod]
        public void Upload_uses_manifest_identity_when_package_file_name_is_different()
        {
            var moduleName = $"direct'{Guid.NewGuid():N}";
            var uploadName = $"renamed-{Guid.NewGuid():N}";
            var packagePath = CreateDirectModulePackage(moduleName);
            try
            {
                var installed = ModulesManager.UploadModule(packagePath, uploadName);
                installed.ShortName.Should().Be(moduleName);
                ModulesManager.GetModuleInfo(installed.ShortName).ShortName.Should().Be(moduleName);
                ModulesManager.GetModuleBibleContent(installed.ShortName).Books.Should().NotBeEmpty();
                Directory.Exists(ModulesManager.GetModuleDirectory(uploadName)).Should().BeFalse();
                ModulesManager.GetModules(true).Count(module => module.ShortName == moduleName).Should().Be(1);
            }
            finally
            {
                if (File.Exists(packagePath)) File.Delete(packagePath);
                ModulesManager.DeleteModule(moduleName);
                var savedPackage = Path.Combine(ModulesManager.GetModulesPackagesDirectory(), uploadName + ".bnm");
                if (File.Exists(savedPackage)) File.Delete(savedPackage);
            }
        }

        private static string CreateDirectModulePackage(string moduleName, string directMappings = null)
        {
            var folder = Path.Combine(Path.GetTempPath(), "BibleNote.DirectMappingTests", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(folder);
            var packagePath = Path.Combine(Path.GetTempPath(), $"{moduleName}.bnm");
            try
            {
                var manifest = File.ReadAllText(ResolveApiFilePath("Modules", "rst", "manifest.xml"));
                manifest = manifest.Replace("ShortName=\"rst\"", $"ShortName=\"{moduleName}\"");
                directMappings ??= @"
  <BibleDirectVerseMappings ReferenceModule=""kjv"" SchemaVersion=""1"" VerseIdRegistry=""bnverse:v1"">
    <BookMappings BookIndex=""1"">
      <Mapping ReferenceChapter=""1"" ReferenceVerse=""1"" ModuleChapter=""1"" ModuleVerse=""2"" />
      <Mapping ReferenceChapter=""1"" ReferenceVerse=""2"" ModuleChapter=""1"" ModuleVerse=""2"" />
    </BookMappings>
    <BookMappings BookIndex=""3"">
      <Mapping ReferenceChapter=""14"" ReferenceVerse=""55"" ModuleChapter=""14"" ModuleVerse=""99"" />
      <Mapping ReferenceChapter=""14"" ReferenceVerse=""56"" ModuleChapter=""14"" ModuleVerse=""99"" />
    </BookMappings>
  </BibleDirectVerseMappings>";
                manifest = manifest.Replace("  <BibleStructure", directMappings + Environment.NewLine + "  <BibleStructure");
                File.WriteAllText(Path.Combine(folder, "manifest.xml"), manifest);
                File.Copy(ResolveApiFilePath("Modules", "rst", "bible.xml"), Path.Combine(folder, "bible.xml"));
                ZipFile.CreateFromDirectory(folder, packagePath);
                return packagePath;
            }
            finally
            {
                Directory.Delete(folder, true);
            }
        }
    }
}
