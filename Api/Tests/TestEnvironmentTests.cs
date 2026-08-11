using System;
using System.IO;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace BibleNote.Tests
{
    [TestClass]
    public class TestEnvironmentTests : TestsBase.TestsBase
    {
        [TestInitialize]
        public void Init()
        {
            base.Init();
        }

        [TestMethod]
        public void BibleModulesAreLoadedFromAnIsolatedDataDirectory()
        {
            var configuredDirectory = Environment.GetEnvironmentVariable("BIBLENOTE_DATA_DIR");

            Assert.AreEqual(Path.GetFullPath(TestDataDirectory), Path.GetFullPath(configuredDirectory));
            Assert.AreEqual(
                Path.Combine(Path.GetFullPath(TestDataDirectory), "Modules"),
                Path.GetFullPath(ModulesManager.GetModulesDirectory()));

            var psalms = ModulesManager.GetCurrentModuleInfo().GetBibleBook("Ps", false);
            Assert.IsNotNull(psalms);
            Assert.AreEqual("kjv", psalms.ModuleName);
        }
    }
}
