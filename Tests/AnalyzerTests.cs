using BibleNote.Analytics.Providers.FileSystem.Navigation;
using BibleNote.Analytics.Providers.OneNote.Enums;
using BibleNote.Analytics.Providers.OneNote.Navigation;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Models;
using BibleNote.Tests.Analytics.TestsBase;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class AnalyzerTests : DbTestsBase
    {
        private IAnalyzer analyzer;

        [TestInitialize]
        public void Init()
        {
            base.Init();

            this.analyzer = ServiceProvider.GetService<IAnalyzer>();
        }

        [TestCleanup]
        public override void Cleanup()
        {
            base.Cleanup();
        }

        [TestMethod]
        public async Task Test1()
        {
            var navigationProvider = ActivatorUtilities.CreateInstance<FileNavigationProvider>(ServiceProvider);
            navigationProvider.Parameters.FolderPaths = new List<string>() { @"C:\prj\BibleNote\Tests\TestData" };
            await this.analyzer.AnalyzeAsync(navigationProvider, new AnalyzerOptions()
            {
                Depth = AnalyzeDepth.All
            });
        }

        [TestMethod]
        public async Task Test2()
        {
            var navigationProvider = ActivatorUtilities.CreateInstance<OneNoteNavigationProvider>(ServiceProvider);
            navigationProvider.Parameters.Levels = new List<OneNoteLevelInfo>() { new OneNoteLevelInfo() { Id = "", Type = OneNoteLevelType.Page, Name = "Test page" } };
            await this.analyzer.AnalyzeAsync(navigationProvider, new AnalyzerOptions()
            {
                Depth = AnalyzeDepth.All
            });
        }
    }
}

