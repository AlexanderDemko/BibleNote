using System.Linq;
using BibleNote.Domain.Entities;
using BibleNote.Tests.TestsBase;
using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace BibleNote.Tests
{
    [TestClass]
    public class DbTests : DbTestsBase
    {
        [TestInitialize]
        public void Init()
        {
            base.Init();        
        }
        
        [TestCleanup]
        public override void Cleanup()
        {
            base.Cleanup();
        }

        [TestMethod]        
        public void TestCreateAndDeleteFolder()
        {
            var foldersCount = 0;
            var testFolderName = "Test1";

            foldersCount = this.AnalyticsContext.DocumentFolderRepository.Count();

            var newFolder = new DocumentFolder() { Name = testFolderName, NavigationProviderName = "Html", Path = "c:\temp" };
            this.AnalyticsContext.DocumentFolderRepository.Add(newFolder);
            this.AnalyticsContext.SaveChangesAsync();

            this.ConcreteContext.Entry(newFolder).State = EntityState.Detached;

            Assert.AreEqual(foldersCount + 1, this.AnalyticsContext.DocumentFolderRepository.Count());
            var folder = this.AnalyticsContext.DocumentFolderRepository.FirstOrDefault(f => f.Name == testFolderName);
            Assert.IsNotNull(folder);
            this.AnalyticsContext.DocumentFolderRepository.Delete(folder);
            this.AnalyticsContext.SaveChangesAsync();

            Assert.AreEqual(foldersCount, this.AnalyticsContext.DocumentFolderRepository.Count());
            Assert.IsNull(this.AnalyticsContext.DocumentFolderRepository.FirstOrDefault(f => f.Name == testFolderName));
        }
    }
}
