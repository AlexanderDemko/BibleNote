using System.Threading.Tasks;

namespace BibleNote.Persistence
{
    public class DbInitializer
    {
        public async static Task InitializeAsync(AnalyticsDbContext context)
        {
            var initializer = new DbInitializer();
            await initializer.SeedAsync(context);
        }

        public async Task SeedAsync(AnalyticsDbContext context)
        {
            await context.Database.EnsureCreatedAsync();            
        }
    }
}
