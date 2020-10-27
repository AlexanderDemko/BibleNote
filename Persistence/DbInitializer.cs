namespace BibleNote.Persistence
{
    public class DbInitializer
    {
        public static void Initialize(AnalyticsDbContext context)
        {
            var initializer = new DbInitializer();
            initializer.Seed(context);
        }

        public void Seed(AnalyticsDbContext context)
        {
            context.Database.EnsureCreated();            
        }
    }
}
