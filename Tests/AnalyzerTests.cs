using System.Collections.Generic;
using System.Threading.Tasks;
using BibleNote.Providers.FileSystem.Navigation;
using BibleNote.Providers.OneNote.Services.NavigationProvider;
using BibleNote.Providers.OneNote.Services.NavigationProvider.Models;
using BibleNote.Services.DocumentProvider.Contracts;
using BibleNote.Services.DocumentProvider.Models;
using BibleNote.Tests.TestsBase;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace BibleNote.Tests
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
    }
}

