namespace BibleNote.Analytics.Persistence
{
    public class DbInitializer
    {
        public static void Initialize(AnalyticsContext context)
        {
            var initializer = new DbInitializer();
            initializer.Seed(context);
        }

        public void Seed(AnalyticsContext context)
        {
            context.Database.EnsureCreated();
            
        }
    }
}
