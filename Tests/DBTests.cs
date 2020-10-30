using System.Linq;
using System.Threading.Tasks;
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
        public async Task TestCreateAndDeleteNavProvider()
        {
            var providersCount = 0;
            var testProviderName = "Test1";

            providersCount = await this.AnalyticsContext.NavigationProvidersInfo.CountAsync();

            var newProvider = new NavigationProviderInfo() { Name = testProviderName, FullTypeName = "test", ParametersRaw = "test" };
            this.AnalyticsContext.NavigationProvidersInfo.Add(newProvider);
            await this.AnalyticsContext.SaveChangesAsync();

            this.ConcreteContext.Entry(newProvider).State = EntityState.Detached;

            Assert.AreEqual(providersCount + 1, await this.AnalyticsContext.NavigationProvidersInfo.CountAsync());
            var provider = await this.AnalyticsContext.NavigationProvidersInfo.SingleOrDefaultAsync(f => f.Name == testProviderName);
            Assert.IsNotNull(provider);
            this.AnalyticsContext.NavigationProvidersInfo.Delete(provider);
            await this.AnalyticsContext.SaveChangesAsync();

            Assert.AreEqual(providersCount, await this.AnalyticsContext.NavigationProvidersInfo.CountAsync());
            Assert.IsNull(await this.AnalyticsContext.NavigationProvidersInfo.SingleOrDefaultAsync(f => f.Name == testProviderName));
        }
    }
}
