using BibleNote.Domain.Enums;

namespace BibleNote.Domain.Entities
{
    public class NavigationProviderInfo
    {
        public int Id { get; set; }

        public string Name { get; set; }

        public string Description { get; set; }

        public bool IsReadonly { get; set; }

        public NavigationProviderType Type { get; set; }

        public string ParametersRaw { get; set; }
    }
}
