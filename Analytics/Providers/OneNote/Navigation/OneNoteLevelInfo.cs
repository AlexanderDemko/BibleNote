using BibleNote.Analytics.Providers.OneNote.Enums;

namespace BibleNote.Analytics.Providers.OneNote.Navigation
{
    public struct OneNoteLevelInfo
    {
        public string Id { get; set; }

        public string Name { get; set; }

        public OneNoteLevelType Type { get; set; }
    }
}
