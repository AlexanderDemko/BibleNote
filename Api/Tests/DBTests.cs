using System.Linq;
using System.Threading.Tasks;
using BibleNote.Domain.Entities;
using BibleNote.Domain.Enums;
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
        public async Task TestCreateAndDeleteNavProvider()
        {
            var providersCount = 0;
            var testProviderName = "Test1";

            providersCount = await this.DbContext.NavigationProvidersInfo.CountAsync();

            var newProvider = new NavigationProviderInfo() { Name = testProviderName, Type = NavigationProviderType.File, ParametersRaw = "test" };
            this.DbContext.NavigationProvidersInfo.Add(newProvider);
            await this.DbContext.SaveChangesAsync();

            this.ConcreteContext.Entry(newProvider).State = EntityState.Detached;

            Assert.AreEqual(providersCount + 1, await this.DbContext.NavigationProvidersInfo.CountAsync());
            var provider = await this.DbContext.NavigationProvidersInfo.SingleOrDefaultAsync(f => f.Name == testProviderName);
            Assert.IsNotNull(provider);
            this.DbContext.NavigationProvidersInfo.Delete(provider);
            await this.DbContext.SaveChangesAsync();

            Assert.AreEqual(providersCount, await this.DbContext.NavigationProvidersInfo.CountAsync());
            Assert.IsNull(await this.DbContext.NavigationProvidersInfo.SingleOrDefaultAsync(f => f.Name == testProviderName));
        }
    }
}
